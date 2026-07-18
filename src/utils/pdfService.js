import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

// html2canvas로 실제 브라우저가 그려낸 HTML을 이미지로 캡처해 jsPDF에 삽입합니다.
// 브라우저의 폰트 폴백을 그대로 이용하므로 한국어·영어·중국어·베트남어 등
// 어떤 언어가 섞여 있어도 별도 폰트 임베드 없이 정상적으로 표시됩니다.

const PAGE_WIDTH_MM = 210
const PAGE_HEIGHT_MM = 297
const MARGIN_MM = 15
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2
const CONTENT_HEIGHT_MM = PAGE_HEIGHT_MM - MARGIN_MM * 2

const CSS_PX_PER_MM = 96 / 25.4
const CONTAINER_WIDTH_PX = Math.round(CONTENT_WIDTH_MM * CSS_PX_PER_MM)
const CAPTURE_SCALE = 2

const FONT_FAMILY =
  "'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans', sans-serif"

const COLORS = {
  brand: '#534AB7',
  heading: '#211F2E',
  body: '#2C2A3A',
  muted: '#6B6375',
  rule: '#DED9F5',
}

export const PDF_SECTIONS = [
  { id: 'info', label: '문서 정보 (파일명, 처리 날짜, 모드)' },
  { id: 'text', label: '추출된 텍스트' },
  { id: 'mapping', label: '인물 매핑표' },
  { id: 'ai', label: 'AI 요약·추천' },
]

export function buildPdfFileName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  const datePart = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  const timePart = `${pad(date.getHours())}${pad(date.getMinutes())}`
  return `PenSight_결과_${datePart}_${timePart}.pdf`
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function headingHtml(title) {
  return `<h2 style="font-size:20px;font-weight:700;color:${COLORS.heading};margin:0 0 10px;">${escapeHtml(title)}</h2>`
}

const BODY_STYLE = `font-size:14px;line-height:1.6;color:${COLORS.body};margin:0 0 4px;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;`

function buildSectionHtml(section) {
  switch (section.type) {
    case 'info':
      return `
        <div style="margin-bottom:24px;">
          ${headingHtml(section.title)}
          ${section.items
            .map(([label, value]) => `<p style="${BODY_STYLE}">${escapeHtml(label)}: ${escapeHtml(value)}</p>`)
            .join('')}
        </div>
      `
    case 'text':
      return `
        <div style="margin-bottom:24px;">
          ${headingHtml(section.title)}
          <p style="${BODY_STYLE}">${escapeHtml(section.content || '(내용 없음)')}</p>
        </div>
      `
    case 'mapping':
      return `
        <div style="margin-bottom:24px;">
          ${headingHtml(section.title)}
          ${section.items
            .map((entry) => `<p style="${BODY_STYLE}">${escapeHtml(entry.alias)}: ${escapeHtml(entry.name)}</p>`)
            .join('')}
        </div>
      `
    case 'ai':
      return `
        <div style="margin-bottom:24px;">
          ${headingHtml(section.title)}
          <p style="${BODY_STYLE}">${escapeHtml((section.content || '').replace(/\*\*/g, ''))}</p>
        </div>
      `
    default:
      return ''
  }
}

function buildDocumentHtml(sections) {
  const generatedAt = new Date().toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  return `
    <div style="font-size:32px;font-weight:700;color:${COLORS.brand};margin-bottom:24px;">PenSight</div>
    ${sections.map(buildSectionHtml).join('')}
    <div style="border-top:2px solid ${COLORS.rule};padding-top:12px;margin-top:12px;">
      <p style="font-size:11px;color:${COLORS.muted};margin:0;">본 문서는 PenSight로 생성되었습니다.</p>
      <p style="font-size:11px;color:${COLORS.muted};margin:4px 0 0;">생성 일시: ${generatedAt}</p>
    </div>
  `
}

function createOffscreenContainer(html) {
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '0'
  container.style.left = '-99999px'
  container.style.zIndex = '-1'
  container.style.width = `${CONTAINER_WIDTH_PX}px`
  container.style.background = '#ffffff'
  container.style.fontFamily = FONT_FAMILY
  container.style.boxSizing = 'border-box'
  container.innerHTML = html
  document.body.appendChild(container)
  return container
}

function sliceCanvasToPdf(pdf, canvas) {
  const pxPerMm = canvas.width / CONTENT_WIDTH_MM
  const pageHeightPx = Math.round(CONTENT_HEIGHT_MM * pxPerMm)

  let offsetPx = 0
  let isFirstPage = true

  while (offsetPx < canvas.height) {
    const sliceHeightPx = Math.min(pageHeightPx, canvas.height - offsetPx)

    const sliceCanvas = document.createElement('canvas')
    sliceCanvas.width = canvas.width
    sliceCanvas.height = sliceHeightPx
    sliceCanvas
      .getContext('2d')
      .drawImage(canvas, 0, offsetPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx)

    if (!isFirstPage) pdf.addPage()
    isFirstPage = false

    const sliceHeightMm = sliceHeightPx / pxPerMm
    pdf.addImage(
      sliceCanvas.toDataURL('image/png'),
      'PNG',
      MARGIN_MM,
      MARGIN_MM,
      CONTENT_WIDTH_MM,
      sliceHeightMm,
    )

    offsetPx += sliceHeightPx
  }
}

/**
 * @param {Array<object>} sections - 포함할 섹션 데이터 배열.
 *   { type: 'info', title, items: [[label, value], ...] }
 *   { type: 'text', title, content }
 *   { type: 'mapping', title, items: [{ alias, name }, ...] }
 *   { type: 'ai', title, content }
 * @param {string} fileName - 다운로드 파일명 (예: PenSight_결과_20260714_1035.pdf)
 */
export async function generatePDF(sections, fileName) {
  const container = createOffscreenContainer(buildDocumentHtml(sections))

  try {
    const canvas = await html2canvas(container, {
      scale: CAPTURE_SCALE,
      backgroundColor: '#ffffff',
      useCORS: true,
    })

    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    sliceCanvasToPdf(pdf, canvas)
    pdf.save(fileName)
  } finally {
    document.body.removeChild(container)
  }
}
