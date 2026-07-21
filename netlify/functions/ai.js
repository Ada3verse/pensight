import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 1536

const AI_FAILURE_MESSAGE = 'AI 분석 중 오류가 발생했습니다. 다시 시도해주세요.'

const VIOLENCE_ROLES = ['가해자', '피해자', '목격자']

function isMockMode() {
  return process.env.DEV_MOCK === 'true' || process.env.NODE_ENV === 'development'
}

function aliasListText(aliases) {
  return aliases.length > 0 ? aliases.join(', ') : '(인물 매핑표 없음)'
}

const GENERAL_PROMPTS = {
  quick: (text) =>
    `다음 텍스트를 한국어로 분석해줘. 반드시 아래 형식으로만 답해줘:\n\n핵심 요약\n(3줄 이내로 요약. 핵심 단어나 개념은 **단어** 형식으로 강조)\n\n주요 키워드\n**키워드1**, **키워드2**, **키워드3**\n\n위 형식 외에 다른 말은 절대 추가하지 마:\n${text}`,
  ai: (text) =>
    `다음 텍스트를 한국어로 분석해줘. 반드시 아래 형식으로만 답해줘. 핵심 요약, 문서 유형, 주요 키워드 세 항목을 예외 없이 모두 출력해야 하고, 어느 항목도 빠뜨리면 안 돼:\n\n핵심 요약\n(3줄 이내로 요약. 핵심 단어나 개념은 **단어** 형식으로 강조)\n\n문서 유형\n(반드시 "진로 상담", "학교폭력 진술", "수행평가", "기타" 이 4가지 중 정확히 하나의 단어만 출력. 다른 설명이나 문장을 덧붙이지 말고 단어 하나만 출력)\n\n주요 키워드\n**키워드1**, **키워드2**, **키워드3**, **키워드4**, **키워드5**\n\n위 형식 외에 다른 말은 절대 추가하지 마:\n${text}`,
}

const DOC_TYPE_PROMPTS = {
  violence: (text, aliases) =>
    `다음은 학교폭력 관련 진술서입니다. 문서 내 인물은 이미 다음 별칭으로 마스킹되어 있다: ${aliasListText(aliases)}.
아래 형식으로만 분석해줘:

핵심 요약
(3줄 이내, 핵심 단어는 **단어** 형식으로 강조)

문서 유형
학교폭력 진술서

역할 분류
(위 별칭 각각에 대해 "별칭: 역할" 형식으로 한 줄씩. 역할은 반드시 가해자/피해자/목격자/불명확 중 하나만. 별칭이 없으면 이 항목은 생략)

역할별 진술
(역할별로 "[역할]" 소제목 뒤에 해당 인물의 진술 내용만 요약. 별칭이 없으면 이 항목은 생략)

사건 정보
날짜: (문서에서 언급된 날짜, 없으면 정보 없음)
장소: (문서에서 언급된 장소, 없으면 정보 없음)
행위: (구체적으로 어떤 행위가 있었는지, 없으면 정보 없음)

사건 유형
(신체폭력 / 언어폭력 / 사이버폭력 / 금품갈취 / 따돌림 / 기타 중 해당하는 것)

주요 키워드
**키워드1**, **키워드2**, **키워드3**

위 형식 외 다른 말은 절대 추가하지 마:
${text}`,
  career: (text, aliases) =>
    `다음은 학생 진로 상담 내용입니다. 문서 내 인물은 이미 다음 별칭으로 마스킹되어 있다: ${aliasListText(aliases)}.
아래 형식으로만 분석해줘:

핵심 요약
(3줄 이내, 핵심 단어는 **단어** 형식으로 강조)

문서 유형
진로 상담지

인물별 키워드
(위 별칭 각각에 대해 "별칭: 키워드1, 키워드2, 키워드3" 형식으로 한 줄씩, 언급된 관심 직업·강점 위주 키워드. 별칭이 없으면 이 항목은 생략)

관심 직업
(학생이 언급한 관심 직업/분야)

강점
(상담 내용에서 드러난 학생의 강점 1~2가지)

보완점
(개선하면 좋을 점 1~2가지, 일반적인 진로 상담 원칙 기반으로만 작성)

희망 진로 분야
(학생이 희망한다고 언급한 구체적 진로 분야, 없으면 정보 없음)

주요 키워드
**키워드1**, **키워드2**, **키워드3**

위 형식 외 다른 말은 절대 추가하지 마:
${text}`,
  assignment: (text) =>
    `다음은 학생 수행평가 답안입니다. 아래 형식으로 분석해줘:\n\n핵심 요약\n(3줄 이내, 핵심 단어는 **단어** 형식으로 강조)\n\n문서 유형\n수행평가 답안지\n\n주요 키워드\n**키워드1**, **키워드2**, **키워드3**\n\n강점\n(답안에서 잘 된 부분 1~2가지)\n\n보완점\n(개선이 필요한 부분 1~2가지)\n\n위 형식 외 다른 말은 절대 추가하지 마:\n${text}`,
}

function buildPrompt(text, mode, docType, aliases) {
  const specializedPrompt = DOC_TYPE_PROMPTS[docType]
  if (specializedPrompt) return specializedPrompt(text, aliases)
  return (GENERAL_PROMPTS[mode] ?? GENERAL_PROMPTS.quick)(text)
}

function buildMockRoleSection(aliases) {
  if (aliases.length === 0) return ''
  return aliases.map((alias, index) => `${alias}: ${VIOLENCE_ROLES[index % VIOLENCE_ROLES.length]}`).join('\n')
}

function buildMockStatementSection(aliases) {
  if (aliases.length === 0) return ''
  return aliases
    .map((alias, index) => {
      const role = VIOLENCE_ROLES[index % VIOLENCE_ROLES.length]
      return `[${role}]\n${alias}은(는) 해당 사건 당시 상황을 다음과 같이 진술함(Mock 데이터).`
    })
    .join('\n\n')
}

function buildMockKeywordSection(aliases) {
  if (aliases.length === 0) return ''
  const sampleKeywords = ['프로그래머', '논리적 사고', '발표 자신감', '디자이너', '창의성', '시간 관리']
  return aliases
    .map((alias, index) => `${alias}: ${sampleKeywords[index % 3]}, ${sampleKeywords[(index % 3) + 3]}`)
    .join('\n')
}

const MOCK_BUILDERS = {
  violence: (aliases) => {
    const roleSection = buildMockRoleSection(aliases)
    const statementSection = buildMockStatementSection(aliases)
    return `핵심 요약
(Mock) **학교폭력** 관련 사건에 대한 진술 내용을 정리함. 관련 인물 간 **갈등 상황**이 확인됨.

문서 유형
학교폭력 진술서
${roleSection ? `\n역할 분류\n${roleSection}\n` : ''}${statementSection ? `\n역할별 진술\n${statementSection}\n` : ''}
사건 정보
날짜: 2026년 5월 중(Mock)
장소: 교실(Mock)
행위: 언어적 갈등 상황(Mock)

사건 유형
언어폭력

주요 키워드
**갈등**, **진술**, **중재 필요**`
  },
  career: (aliases) => {
    const keywordSection = buildMockKeywordSection(aliases)
    return `핵심 요약
(Mock) 학생의 **진로 희망 분야**와 관심사를 정리함.

문서 유형
진로 상담지
${keywordSection ? `\n인물별 키워드\n${keywordSection}\n` : ''}
관심 직업
소프트웨어 개발자(Mock)

강점
논리적 문제 해결 능력이 뛰어남(Mock)

보완점
발표 상황에서의 자신감 보완이 필요함(Mock)

희망 진로 분야
컴퓨터공학 계열(Mock)

주요 키워드
**진로**, **관심분야**, **자기이해**`
  },
  assignment: () => `핵심 요약
(Mock) 수행평가 답안의 **핵심 논지**와 접근 방식을 정리함.

문서 유형
수행평가 답안지

주요 키워드
**논리 전개**, **근거 제시**, **결론**

강점
주제에 대한 이해도가 높고 근거를 체계적으로 제시함(Mock)

보완점
결론부의 요약이 다소 부족함(Mock)`,
  general: () => `핵심 요약
(Mock) 문서의 **핵심 내용**을 요약함.

주요 키워드
**요약**, **핵심내용**, **참고자료**`,
}

function buildMockResponse(mode, docType, aliases) {
  const builder = MOCK_BUILDERS[docType] ?? MOCK_BUILDERS.general
  return builder(aliases)
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { error: 'Method Not Allowed' })
    }

    let payload
    try {
      payload = JSON.parse(event.body || '{}')
    } catch {
      return jsonResponse(400, { error: '잘못된 요청입니다.' })
    }

    const { text, mode, docType, aliases } = payload
    if (!text) {
      return jsonResponse(400, { error: '분석할 텍스트가 없습니다.' })
    }

    const safeAliases = Array.isArray(aliases) ? aliases.filter((a) => typeof a === 'string') : []

    if (isMockMode()) {
      console.log('[MOCK MODE] 실제 API 미호출')
      return jsonResponse(200, { result: buildMockResponse(mode, docType, safeAliases) })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.error('[ai] ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.')
      return jsonResponse(500, { error: AI_FAILURE_MESSAGE })
    }

    const client = new Anthropic({ apiKey })

    let response
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: buildPrompt(text, mode, docType, safeAliases) }],
      })
    } catch (err) {
      console.error('[ai] Anthropic API 호출 실패', err)
      return jsonResponse(502, { error: AI_FAILURE_MESSAGE })
    }

    const textBlock = response.content.find((block) => block.type === 'text')
    if (!textBlock) {
      console.error('[ai] Anthropic 응답에 text 블록이 없음', response)
      return jsonResponse(502, { error: AI_FAILURE_MESSAGE })
    }

    return jsonResponse(200, { result: textBlock.text })
  } catch (err) {
    console.error('[ai] 처리되지 않은 오류', err)
    return jsonResponse(500, { error: AI_FAILURE_MESSAGE })
  }
}
