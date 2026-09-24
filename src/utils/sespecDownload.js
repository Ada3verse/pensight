// 세특 생성 결과 다운로드 (XLSX / PDF / TXT). 모두 클라이언트에서만 처리하며 API를 호출하지 않습니다.

const SHORT_LENGTH_THRESHOLD = 300
const FORBIDDEN_TEXT_WARNING = '[경고: 금지어 포함]'

export function buildSespecFileName(ext, date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `세특_결과_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}.${ext}`
}

function formatDate(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function hasWarning(item) {
  return item.forbiddenWords?.length > 0
}

function metaEntries(meta, date) {
  return [
    ['과목명', meta.subjectName],
    ['학년', meta.grade ? `${meta.grade}학년` : ''],
    ['활동명', meta.activityName],
    ['생성일', formatDate(date)],
  ]
}

function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadTxt(results, meta, date = new Date()) {
  const divider = '---'
  const header = metaEntries(meta, date).map(([label, value]) => `${label}: ${value}`).join('\n')
  const body = results
    .map((item, index) => {
      const lines = [`[${index + 1}] 학생ID: ${item.alias}`]
      if (hasWarning(item)) lines.push(`${FORBIDDEN_TEXT_WARNING} ${item.forbiddenWords.join(', ')}`)
      lines.push(item.sespec, `(${item.sespec.length}자)`)
      return lines.join('\n')
    })
    .join(`\n\n${divider}\n\n`)
  const text = `${header}\n\n${divider}\n\n${body}\n`
  saveBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), buildSespecFileName('txt', date))
}

export async function downloadXlsx(results, meta, date = new Date()) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('세특 결과')
  sheet.columns = [
    { width: 8 },
    { width: 14 },
    { width: 90 },
    { width: 10 },
    { width: 30 },
  ]

  metaEntries(meta, date).forEach(([label, value]) => {
    const row = sheet.addRow([label, value])
    row.getCell(1).font = { bold: true }
  })
  sheet.addRow([])

  const headerRow = sheet.addRow(['번호', '학생ID', '세특 초안', '글자수', '경고(금지어)'])
  headerRow.font = { bold: true }
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEAFB' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })

  results.forEach((item, index) => {
    const length = item.sespec.length
    const row = sheet.addRow([
      index + 1,
      item.alias,
      item.sespec,
      length,
      hasWarning(item) ? item.forbiddenWords.join(', ') : '',
    ])
    row.getCell(3).alignment = { wrapText: true, vertical: 'top' }
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'top' }
    if (length < SHORT_LENGTH_THRESHOLD) {
      row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
    }
    if (hasWarning(item)) row.getCell(5).font = { color: { argb: 'FFD32F2F' } }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  saveBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    buildSespecFileName('xlsx', date),
  )
}

const PDF_FONT_NAME = 'NotoSansKR'
const PDF_MARGIN = 15
const PDF_LINE_HEIGHT = 6
const RED = [211, 47, 47]
const BODY = [44, 42, 58]
const MUTED = [107, 99, 117]

// Noto Sans KR Regular를 KS X 1001 한글 2,350자 + 기본 문자로 서브셋한 TTF를 사용합니다.
async function loadPdfFontBase64() {
  const { default: fontUrl } = await import('../assets/fonts/NotoSansKR-Regular-KSX1001.ttf?url')
  const buffer = await (await fetch(fontUrl)).arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

// 텍스트 기반 PDF: 이미지 캡처가 아니라 임베드 폰트로 글자를 그려 복사·검색이 가능합니다.
export async function downloadPdf(results, meta, date = new Date()) {
  const [{ jsPDF }, fontBase64] = await Promise.all([import('jspdf'), loadPdfFontBase64()])

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.addFileToVFS(`${PDF_FONT_NAME}.ttf`, fontBase64)
  doc.addFont(`${PDF_FONT_NAME}.ttf`, PDF_FONT_NAME, 'normal')
  doc.setFont(PDF_FONT_NAME, 'normal')

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - PDF_MARGIN * 2
  let y = PDF_MARGIN

  // 줄 단위로 출력하며 페이지가 넘치면 새 페이지로 넘깁니다.
  const writeLines = (text, { size = 11, color = BODY } = {}) => {
    doc.setFontSize(size)
    doc.setTextColor(...color)
    const lineHeight = size * 0.5
    doc.splitTextToSize(String(text), contentWidth).forEach((line) => {
      if (y + lineHeight > pageHeight - PDF_MARGIN) {
        doc.addPage()
        y = PDF_MARGIN
      }
      doc.text(line, PDF_MARGIN, y, { baseline: 'top' })
      y += lineHeight + 1
    })
  }

  const drawDivider = () => {
    if (y + PDF_LINE_HEIGHT > pageHeight - PDF_MARGIN) {
      doc.addPage()
      y = PDF_MARGIN
    }
    y += 2
    doc.setDrawColor(222, 217, 245)
    doc.line(PDF_MARGIN, y, pageWidth - PDF_MARGIN, y)
    y += 4
  }

  writeLines('세특 결과', { size: 20, color: [83, 74, 183] })
  y += 3
  metaEntries(meta, date).forEach(([label, value]) => writeLines(`${label}: ${value}`, { size: 11 }))

  results.forEach((item, index) => {
    drawDivider()
    const warned = hasWarning(item)
    const color = warned ? RED : BODY
    const length = item.sespec.length
    const short = length < SHORT_LENGTH_THRESHOLD

    writeLines(`${index + 1}. 학생ID: ${item.alias}`, { size: 12, color })
    writeLines(`글자수: ${length}자${short ? ` (${SHORT_LENGTH_THRESHOLD}자 미만)` : ''}`, {
      size: 10,
      color: short ? RED : MUTED,
    })
    if (warned) writeLines(`${FORBIDDEN_TEXT_WARNING} ${item.forbiddenWords.join(', ')}`, { size: 10, color: RED })
    y += 1
    writeLines(item.sespec, { size: 11, color })
    y += 2
  })

  doc.save(buildSespecFileName('pdf', date))
}
