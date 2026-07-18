const OCR_FUNCTION_URL = '/.netlify/functions/ocr'
const PDFJS_SCRIPT_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
const PDFJS_WORKER_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
const PDF_RENDER_SCALE = 2

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

async function pdfFileToPageImages(file) {
  const pdfjsLib = await loadPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const base64Pages = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const context = canvas.getContext('2d')
    await page.render({ canvasContext: context, viewport }).promise
    base64Pages.push(canvas.toDataURL('image/png').split(',')[1])
  }
  return base64Pages
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

async function extractTextFromPdf(file) {
  const base64Pages = await pdfFileToPageImages(file)
  const pageTexts = []
  for (const base64 of base64Pages) {
    pageTexts.push(await callVisionApi(base64, 'image/png'))
  }
  return pageTexts.join('\n\n')
}

export async function extractTextFromFile(file) {
  if (file.type === 'application/pdf') {
    return extractTextFromPdf(file)
  }
  return extractTextFromImage(file)
}
