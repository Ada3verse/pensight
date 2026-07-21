import { parseAliasLines } from './aliasLineParser.js'

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// parseAiSections(빈 줄 기준 분할)는 "역할별 진술"처럼 한 섹션 안에 여러
// 인물의 내용이 빈 줄로 나뉘어 들어가는 구조에서는 그 내부 빈 줄 때문에
// 섹션이 조각나 버린다. 그래서 학폭/진로 문서처럼 알려진 제목 집합이 고정된
// 경우에는, 그 제목들이 줄 맨 앞에 단독으로 나오는 위치를 앵커로 삼아
// 분할한다 — 섹션 내부에 빈 줄이 몇 개 있든 다음 알려진 제목 전까지는
// 전부 같은 섹션의 내용으로 취급되어 안전하다.
function splitByKnownTitles(text, titles) {
  if (!text) return new Map()
  const pattern = new RegExp(`^(${titles.map(escapeRegExp).join('|')})\\s*$`, 'gm')
  const matches = [...text.matchAll(pattern)]
  const result = new Map()
  for (let i = 0; i < matches.length; i += 1) {
    const title = matches[i][1]
    const start = matches[i].index + matches[i][0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length
    result.set(title, text.slice(start, end).trim())
  }
  return result
}

// "역할별 진술" 섹션은 "[역할]\n내용" 블록들로 이루어진다. 블록 사이에
// 빈 줄이 있든 없든 상관없이 대괄호 표시를 기준으로 분리한다.
// 대괄호 형식을 지키지 않은 내용도 버리지 않고 역할을 '불명확'으로 대체한다.
function parseRoleStatements(sectionText) {
  if (!sectionText) return []
  const parts = sectionText.split(/\[([^\]]+)\]/).slice(1)
  const result = []
  for (let i = 0; i < parts.length; i += 2) {
    const role = parts[i].trim() || '불명확'
    const statement = (parts[i + 1] || '').trim()
    if (statement) result.push({ role, statement })
  }
  return result
}

const VIOLENCE_SECTION_TITLES = [
  '핵심 요약',
  '문서 유형',
  '역할 분류',
  '역할별 진술',
  '사건 정보',
  '사건 유형',
  '주요 키워드',
]

const CAREER_SECTION_TITLES = [
  '핵심 요약',
  '문서 유형',
  '인물별 키워드',
  '관심 직업',
  '강점',
  '보완점',
  '희망 진로 분야',
  '주요 키워드',
]

// 학폭 문서 분석 결과를 화면에 표시할 구조로 변환한다.
// 어떤 항목이 응답에서 빠져 있어도 빈 배열/빈 문자열로 대체되어 화면이 깨지지 않는다.
export function parseViolenceAnalysis(text) {
  const byTitle = splitByKnownTitles(text, VIOLENCE_SECTION_TITLES)
  return {
    summary: byTitle.get('핵심 요약') ?? '',
    roles: parseAliasLines(byTitle.get('역할 분류') ?? '').map(({ alias, value }) => ({
      alias,
      role: value,
    })),
    statements: parseRoleStatements(byTitle.get('역할별 진술') ?? ''),
    incidentInfo: parseAliasLines(byTitle.get('사건 정보') ?? '').map(({ alias, value }) => ({
      label: alias,
      value,
    })),
    incidentType: byTitle.get('사건 유형') ?? '',
    keywords: byTitle.get('주요 키워드') ?? '',
  }
}

// 진로 상담 문서 분석 결과를 화면에 표시할 구조로 변환한다.
export function parseCareerAnalysis(text) {
  const byTitle = splitByKnownTitles(text, CAREER_SECTION_TITLES)
  return {
    summary: byTitle.get('핵심 요약') ?? '',
    personKeywords: parseAliasLines(byTitle.get('인물별 키워드') ?? '').map(({ alias, value }) => ({
      alias,
      tags: value === '-' ? [] : value.split(',').map((tag) => tag.trim()).filter(Boolean),
    })),
    interestJob: byTitle.get('관심 직업') ?? '',
    strengths: byTitle.get('강점') ?? '',
    improvements: byTitle.get('보완점') ?? '',
    desiredField: byTitle.get('희망 진로 분야') ?? '',
    keywords: byTitle.get('주요 키워드') ?? '',
  }
}
