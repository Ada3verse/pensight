import { loadPdfJs } from './ocrService'
import { authedFetch } from './session'

// 참고자료(매뉴얼·채점 기준표·세특 예시문) 업로드 준비와 교사용 API.
// PDF/TXT의 텍스트는 브라우저에서 추출하고(OCR 없음 → Vision 비용 없음), 원본 파일과 함께 서버로 보낸다.

const REFERENCES_URL = '/.netlify/functions/references'
const MAX_FILE_BYTES = 4 * 1024 * 1024
const MAX_PDF_PAGES = 200

export const PERSONAL_CATEGORIES = [
  { id: 'rubric', label: '수행평가 채점 기준표', hint: '수행평가 문서 분석 시 참고됩니다.' },
  { id: 'style', label: '세특 예시문', hint: '세특 생성 시 문체 학습에 사용됩니다.' },
]

export const SHARED_CATEGORIES = [
  { id: 'violence', label: '학폭 매뉴얼' },
  { id: 'career', label: '진로 상담 매뉴얼' },
  { id: 'general', label: '기타 공통 자료' },
]

export class ReferenceError extends Error {}

function extensionOf(name) {
  const match = /\.([a-z0-9]+)$/i.exec(name)
  return match ? match[1].toLowerCase() : ''
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

function decodeText(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    // 한국어 TXT는 EUC-KR(CP949)로 저장된 경우가 많다.
    return new TextDecoder('euc-kr').decode(buffer)
  }
}

async function extractPdfText(buffer) {
  const pdfjsLib = await loadPdfJs()
  const pdf = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise
  const pages = Math.min(pdf.numPages, MAX_PDF_PAGES)
  const parts = []
  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    parts.push(content.items.map((item) => item.str + (item.hasEOL ? '\n' : ' ')).join('').trim())
  }
  return parts.join('\n\n')
}

/** 업로드할 파일을 검사하고 { fileName, text, fileBase64 }로 만든다. 실패하면 ReferenceError. */
export async function prepareReferenceUpload(file) {
  const ext = extensionOf(file.name)
  if (ext !== 'pdf' && ext !== 'txt') throw new ReferenceError('PDF 또는 TXT 파일만 올릴 수 있습니다.')
  if (file.size > MAX_FILE_BYTES) throw new ReferenceError('파일 크기가 너무 큽니다. (최대 4MB)')

  const buffer = await file.arrayBuffer()
  let text
  try {
    text = ext === 'pdf' ? await extractPdfText(buffer) : decodeText(buffer)
  } catch {
    throw new ReferenceError('파일을 읽지 못했습니다. 손상되었거나 지원하지 않는 파일입니다.')
  }
  if (!text.trim()) {
    throw new ReferenceError('파일에서 텍스트를 읽지 못했습니다. 스캔본 PDF는 지원하지 않습니다.')
  }
  return { fileName: file.name, text, fileBase64: toBase64(buffer) }
}

async function readJson(response, fallback) {
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new ReferenceError(data?.error || fallback)
  return data
}

export async function listMyReferences() {
  const data = await readJson(await authedFetch(REFERENCES_URL), '참고자료를 불러오지 못했습니다.')
  return data.references
}

export async function uploadMyReference(category, file) {
  const prepared = await prepareReferenceUpload(file)
  return readJson(
    await authedFetch(REFERENCES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, ...prepared }),
    }),
    '업로드에 실패했습니다.',
  )
}

export async function deleteMyReference(id) {
  await readJson(
    await authedFetch(REFERENCES_URL, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }),
    '삭제에 실패했습니다.',
  )
}
