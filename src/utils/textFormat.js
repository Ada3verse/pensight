function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function formatAiSummary(text) {
  if (!text) return ''
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
}

// AI 응답은 "라벨\n내용" 블록을 빈 줄로 구분해 나열하는 형식을 공통으로 따르므로
// (핵심 요약/문서 유형/사건 유형/관심 분야/상담 방향/강점/보완점 등 문서 유형과 무관하게 동일),
// 문서 유형별로 다른 파서를 두지 않고 이 블록 구조만 분리해 각 섹션을 렌더링한다.
export function parseAiSections(text) {
  if (!text) return []
  return text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [firstLine, ...rest] = block.split('\n')
      return { title: firstLine.trim(), content: rest.join('\n').trim() }
    })
    .filter((section) => section.title)
}
