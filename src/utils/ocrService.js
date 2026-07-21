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

function loadPdfJs() {
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

async function callVisionApi(base64Image, mimeType) {
  let response
  try {
    response = await fetch(OCR_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64Image, mimeType }),
    })
  } catch {
    throw new OcrError('network', '네트워크 연결을 확인하고 몇 분 후 다시 시도해주세요.')
  }

  if (!response.ok) {
    throw new OcrError('api', 'OCR 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
  }

  const data = await response.json()
  if (data.error) {
    throw new OcrError('api', 'OCR 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
  }

  return data.text ?? ''
}

async function extractTextFromImage(file) {
  const base64 = await fileToBase64(file)
  return callVisionApi(base64, file.type)
}

async function extractTextFromPdf(file, { onProgress, onNotice } = {}) {
  const pdfjsLib = await loadPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const totalPages = pdf.numPages
  const pagesToProcess = Math.min(totalPages, MAX_PDF_PAGES)
  if (totalPages > MAX_PDF_PAGES) {
    onNotice?.(PAGE_LIMIT_MESSAGE)
  }

  async function renderAndRecognizePage(pageNumber) {
    onProgress?.(`PDF 분석 중... (${pageNumber}/${pagesToProcess}페이지)`)
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const context = canvas.getContext('2d')
    await page.render({ canvasContext: context, viewport }).promise
    const base64 = canvas.toDataURL('image/png').split(',')[1]
    return callVisionApi(base64, 'image/png')
  }

  const sections = []
  for (let pageNumber = 1; pageNumber <= pagesToProcess; pageNumber += 1) {
    try {
      const pageText = await renderAndRecognizePage(pageNumber)
      sections.push(pageText)
    } catch {
      sections.push(`[${pageNumber}페이지 인식 실패]`)
    }
  }

  // 페이지 사이는 문단 구분(빈 줄)만 넣고, 페이지 번호 표시는 넣지 않는다.
  // 표시를 넣으면 문장이 페이지 경계에서 이어지는 경우 그 표시가 문장
  // 중간에 끼어들어 텍스트가 부자연스럽게 끊겨 보인다.
  return sections.join('\n\n')
}

export async function extractTextFromFile(file, options) {
  if (file.type === 'application/pdf') {
    return extractTextFromPdf(file, options)
  }
  return extractTextFromImage(file)
}
