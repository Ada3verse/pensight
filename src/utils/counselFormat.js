// AI 상담 추천 응답("방법론 / 상담 스크립트 / 절차 가이드" 세 제목으로 구분된 텍스트)을 탭별로 나눈다.

export const COUNSEL_TABS = [
  { id: 'method', label: '방법론', heading: '방법론' },
  { id: 'script', label: '스크립트', heading: '상담 스크립트' },
  { id: 'procedure', label: '절차', heading: '절차 가이드' },
]

const HEADING_LINE = /^\s*(?:#{1,4}\s*)?(?:\d+[.)]\s*)?\**\s*(방법론|상담 스크립트|절차 가이드)\s*\**\s*:?\s*$/

/** @returns {{ method: string, script: string, procedure: string }} 찾지 못한 섹션은 빈 문자열 */
export function parseCounsel(rawText) {
  const result = { method: '', script: '', procedure: '' }
  if (typeof rawText !== 'string') return result

  let currentId = null
  const buckets = { method: [], script: [], procedure: [] }
  for (const line of rawText.split('\n')) {
    const match = HEADING_LINE.exec(line)
    if (match) {
      currentId = COUNSEL_TABS.find((tab) => tab.heading === match[1]).id
      continue
    }
    if (currentId) buckets[currentId].push(line)
  }
  for (const id of Object.keys(buckets)) result[id] = buckets[id].join('\n').trim()
  return result
}

/** 스크립트 텍스트를 [{ role: '교사'|'학생'|null, text }] 로 나눈다. 역할 표시가 없는 줄은 role null. */
export function parseScriptLines(scriptText) {
  return scriptText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^[-*•\s]*\**\s*(교사|학생)\s*\**\s*[:：]\s*(.*)$/.exec(line)
      return match ? { role: match[1], text: match[2].replace(/^["“]|["”]$/g, '').trim() } : { role: null, text: line }
    })
}
