import { authedFetch } from './session'
import { isLimitResponse, readLimitMessage } from './usageLimit'

const OCR_FUNCTION_URL = '/.netlify/functions/ocr'
const PDFJS_SCRIPT_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
const PDFJS_WORKER_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
const PDF_RENDER_SCALE = 2
const MAX_PDF_PAGES = 10
const PAGE_LIMIT_MESSAGE = '페이지가 너무 많습니다. 처음 10페이지만 처리합니다.'

export class OcrError extends Error {
  constructor(type, message) {
    super(message)
    this.name = 'OcrError'
    this.type = type
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = () =>
      reject(new OcrError('api', '파일을 읽는 중 오류가 발생했습니다.'))
    reader.readAsDataURL(file)
  })
}

let pdfjsLoadPromise = null

export function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib)
  if (pdfjsLoadPromise) return pdfjsLoadPromise

  pdfjsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = PDFJS_SCRIPT_URL
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL
      resolve(window.pdfjsLib)
    }
    script.onerror = () => {
      pdfjsLoadPromise = null
      reject(new OcrError('network', 'pdf.js 라이브러리를 불러오지 못했습니다.'))
    }
    document.head.appendChild(script)
  })

  return pdfjsLoadPromise
}

// 서버(ocr 함수)가 OCR 직후 개인정보를 마스킹해서 내려준다. 브라우저는 마스킹 전 원문을 받지 않는다.
// 응답: { maskedText, mappingTable: [{ alias, name }], mappingStatus: 'success' | 'empty', autoMaskCount }
async function callOcrApi(base64Image, mimeType, priorMapping = []) {
  let response
  try {
    response = await authedFetch(OCR_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64Image, mimeType, priorMapping }),
    })
  } catch {
    throw new OcrError('network', '네트워크 연결을 확인하고 몇 분 후 다시 시도해주세요.')
  }

  if (isLimitResponse(response)) {
    throw new OcrError('limit', await readLimitMessage(response))
  }

  const data = await response.json().catch(() => null)
  if (!response.ok || !data || data.error) {
    throw new OcrError('api', data?.error || 'OCR 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
  }

  return {
    maskedText: data.maskedText ?? '',
    mappingTable: Array.isArray(data.mappingTable) ? data.mappingTable : [],
    mappingStatus: data.mappingStatus ?? 'empty',
    autoMaskCount: data.autoMaskCount ?? 0,
  }
}

async function extractFromImage(file) {
  const base64 = await fileToBase64(file)
  return callOcrApi(base64, file.type)
}

async function extractFromPdf(file, { onProgress, onNotice } = {}) {
  const pdfjsLib = await loadPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const totalPages = pdf.numPages
  const pagesToProcess = Math.min(totalPages, MAX_PDF_PAGES)
  if (totalPages > MAX_PDF_PAGES) {
    onNotice?.(PAGE_LIMIT_MESSAGE)
  }

  async function renderAndRecognizePage(pageNumber, priorMapping) {
    onProgress?.(`PDF 분석 중... (${pageNumber}/${pagesToProcess}페이지)`)
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const context = canvas.getContext('2d')
    await page.render({ canvasContext: context, viewport }).promise
    const base64 = canvas.toDataURL('image/png').split(',')[1]
    return callOcrApi(base64, 'image/png', priorMapping)
  }

  const sections = []
  let mappingTable = []
  let autoMaskCount = 0
  for (let pageNumber = 1; pageNumber <= pagesToProcess; pageNumber += 1) {
    try {
      // 페이지마다 별칭(가/나/다)이 달라지지 않도록 앞 페이지까지의 매핑표를 이어서 넘긴다.
      const page = await renderAndRecognizePage(pageNumber, mappingTable)
      sections.push(page.maskedText)
      mappingTable = page.mappingTable
      autoMaskCount += page.autoMaskCount
    } catch (err) {
      // 사용량 한도 초과는 이후 페이지도 모두 실패하므로 페이지별 실패로 넘기지 않고 바로 알린다.
      if (err instanceof OcrError && err.type === 'limit') throw err
      sections.push(`[${pageNumber}페이지 인식 실패]`)
    }
  }

  // 페이지 사이는 문단 구분(빈 줄)만 넣고, 페이지 번호 표시는 넣지 않는다.
  // 표시를 넣으면 문장이 페이지 경계에서 이어지는 경우 그 표시가 문장
  // 중간에 끼어들어 텍스트가 부자연스럽게 끊겨 보인다.
  return {
    maskedText: sections.join('\n\n'),
    mappingTable,
    mappingStatus: mappingTable.length > 0 ? 'success' : 'empty',
    autoMaskCount,
  }
}

/** 파일을 OCR하고 서버에서 마스킹된 결과({ maskedText, mappingTable, mappingStatus, autoMaskCount })를 돌려준다. */
export async function extractMaskedDocument(file, options) {
  if (file.type === 'application/pdf') {
    return extractFromPdf(file, options)
  }
  return extractFromImage(file)
}

/** 마스킹된 텍스트만 필요한 호출자(세특 생성 흐름)용. */
export async function extractTextFromFile(file, options) {
  return (await extractMaskedDocument(file, options)).maskedText
}
