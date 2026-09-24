import Anthropic from '@anthropic-ai/sdk'
import { guardUsage } from './lib/usage.js'
import { logServerError } from './lib/errorLog.js'
import { getAdminDb } from './lib/firebaseAdmin.js'
import { requireSession } from './lib/session.js'
import { buildAnalysisReferenceBlock } from './lib/references.js'

// AI 상담 추천(학교폭력·진로 문서 전용): 방법론 / 상담 스크립트 / 절차 가이드.
// 기존 AI 분석(ai.js)과 별도의 Claude 호출이며, 교사가 "상담 추천 보기"를 눌렀을 때만 호출된다.

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 2048
const MAX_TEXT_LENGTH = 30000
const MAX_SUMMARY_LENGTH = 8000

const COUNSEL_FAILURE_MESSAGE = '상담 추천을 만드는 중 오류가 발생했습니다. 다시 시도해주세요.'

function isMockMode() {
  return process.env.DEV_MOCK === 'true' || process.env.NODE_ENV === 'development'
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

const COMMON_RULES = `작성 규칙:
- 문서 속 인물은 이미 별칭(가, 나, 다 등)으로 마스킹되어 있으니 별칭 그대로 사용하고 실명을 추측하지 마.
- 이 내용은 상담을 돕는 참고 자료이며, 최종 판단과 조치는 교사와 학교가 한다는 점을 존중하는 표현으로 써줘.
- 문서에 없는 사실을 지어내지 마.
- 아래 형식의 제목 세 개(방법론 / 상담 스크립트 / 절차 가이드)를 각각 한 줄로 그대로 쓰고, 그 외 다른 설명은 추가하지 마.`

const PROMPTS = {
  violence: (text, summary) => `다음은 학교폭력 관련 진술서(개인정보 마스킹됨)와 AI 분석 요약입니다. 담임교사·상담교사가 활용할 상담 추천을 작성해줘.

${COMMON_RULES}
- 학교폭력 처리 절차의 구체적인 기한이나 법령 조항은 참고 자료에 있을 때만 언급하고, 없으면 "학교 매뉴얼·관련 법령을 확인" 하도록 안내해줘.

출력 형식:
방법론
(이 사안에 적합한 상담 접근 방식을 순서대로. 예: 피해학생 우선 면담 → 목격자 확인 → 가해학생 면담. 각 단계에서 유의할 점 포함)

상담 스크립트
(교사가 학생에게 실제로 쓸 수 있는 대화 예시를 3~5개 문장으로. 각 줄은 반드시 "교사: ..." 또는 "학생: ..." 로 시작해 역할을 구분)

절차 가이드
(학교폭력 사안 처리 절차를 "1단계: ..." 형식으로 단계별 안내)

[AI 분석 요약]
${summary || '(없음)'}

[진술서 내용]
${text}`,
  career: (text, summary) => `다음은 학생 진로 상담 내용(개인정보 마스킹됨)과 AI 분석 요약입니다. 담임교사·진로상담교사가 활용할 상담 추천을 작성해줘.

${COMMON_RULES}

출력 형식:
방법론
(이 학생에게 적합한 진로 상담 접근 방식을 순서대로. 예: 강점 기반 탐색 → 직업 흥미 검사 연계. 각 단계에서 유의할 점 포함)

상담 스크립트
(교사가 학생에게 실제로 쓸 수 있는 대화 예시를 3~5개 문장으로. 각 줄은 반드시 "교사: ..." 또는 "학생: ..." 로 시작해 역할을 구분)

절차 가이드
(진로 상담 이후 후속 조치를 "1단계: ..." 형식으로 단계별 안내)

[AI 분석 요약]
${summary || '(없음)'}

[상담 내용]
${text}`,
}

const MOCK_RESULTS = {
  violence: `방법론
(Mock) 1. 피해학생 우선 면담: 안전을 먼저 확인하고 충분히 들어주며 비밀 보장의 범위를 안내함
2. 목격자 확인: 개별 면담으로 사실관계를 교차 확인하며 서로의 진술이 섞이지 않게 함
3. 가해학생 면담: 비난보다 사실 확인과 행동의 영향을 이해하도록 돕는 방식으로 진행함

상담 스크립트
교사: 지금 안전하다고 느끼는지 먼저 이야기해 줄 수 있을까?
학생: 아직은 무섭고, 학교 오는 게 힘들어요.
교사: 말해줘서 고마워. 네 잘못이 아니고, 선생님이 함께 해결 방법을 찾을게.
학생: 다른 친구들이 알게 되는 건 싫어요.
교사: 꼭 필요한 선생님들 외에는 알리지 않도록 조심할게.

절차 가이드
1단계: 사안 인지 및 접수, 피해·가해 학생 분리 등 긴급 조치
2단계: 학교장 보고 및 관련 기관 보고(학교 매뉴얼·관련 법령의 기한 확인)
3단계: 전담기구 사실 확인과 조사
4단계: 보호자 안내 및 학생 심리 지원 연계
5단계: 이후 관계 회복·재발 방지 상담과 경과 관찰`,
  career: `방법론
(Mock) 1. 강점 기반 탐색: 학생이 잘하고 즐기는 활동을 먼저 이야기하며 자기 이해를 넓힘
2. 직업 흥미 검사 연계: 검사 결과를 참고 자료로 삼아 관심 분야를 구체화함
3. 진로 체험·정보 탐색 계획: 실행 가능한 작은 과제를 함께 정함

상담 스크립트
교사: 요즘 가장 재미있게 몰입했던 활동이 뭐였어?
학생: 코딩 수업에서 직접 프로그램을 만들 때가 제일 좋았어요.
교사: 그 활동에서 어떤 점이 특히 마음에 들었는지 더 말해줄래?
학생: 문제를 하나씩 해결하는 과정이 재미있어요.
교사: 그 강점을 살릴 수 있는 직업들을 같이 찾아보자.

절차 가이드
1단계: 상담 내용과 학생의 강점·관심사를 기록으로 정리
2단계: 직업 흥미 검사 안내 및 결과 해석 상담
3단계: 관심 분야 진로 체험·직업 정보 탐색 활동 연결
4단계: 학생·보호자와 진로 계획 공유
5단계: 한 학기 뒤 후속 상담으로 변화 확인`,
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

    const { docType, text, summary } = payload
    // 학교폭력·진로 문서에서만 제공한다(수행평가·일반 문서는 요청 자체를 거부).
    if (!PROMPTS[docType]) {
      return jsonResponse(400, { error: '상담 추천은 학교폭력·진로 문서에서만 사용할 수 있습니다.' })
    }
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_LENGTH) {
      return jsonResponse(400, { error: '상담 내용이 올바르지 않습니다.' })
    }
    const safeSummary = typeof summary === 'string' ? summary.slice(0, MAX_SUMMARY_LENGTH) : ''

    const blocked = await guardUsage('counsel', event)
    if (blocked) return blocked
    const { nickname } = await requireSession(event)

    if (isMockMode()) {
      console.log('[MOCK MODE] 실제 API 미호출')
      return jsonResponse(200, { result: MOCK_RESULTS[docType] })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      await logServerError(event, 'counsel', 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.')
      return jsonResponse(500, { error: COUNSEL_FAILURE_MESSAGE })
    }

    // 등록된 매뉴얼(학폭·진로)이 있으면 프롬프트 앞에 붙인다. 없거나 조회에 실패하면 기존 방식 그대로 진행한다.
    let referenceBlock = ''
    try {
      referenceBlock = await buildAnalysisReferenceBlock(getAdminDb(), { docType, nickname, text })
    } catch (err) {
      await logServerError(event, 'counsel', '참고자료 조회 실패(매뉴얼 없이 진행)', err)
    }

    let response
    try {
      response = await new Anthropic({ apiKey }).messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: referenceBlock + PROMPTS[docType](text, safeSummary) }],
      })
    } catch (err) {
      await logServerError(event, 'counsel', 'Anthropic API 호출 실패', err)
      return jsonResponse(502, { error: COUNSEL_FAILURE_MESSAGE })
    }

    const textBlock = response.content.find((block) => block.type === 'text')
    if (!textBlock) {
      await logServerError(event, 'counsel', 'Anthropic 응답에 text 블록이 없음', response)
      return jsonResponse(502, { error: COUNSEL_FAILURE_MESSAGE })
    }

    return jsonResponse(200, { result: textBlock.text })
  } catch (err) {
    await logServerError(event, 'counsel', '처리되지 않은 오류', err)
    return jsonResponse(500, { error: COUNSEL_FAILURE_MESSAGE })
  }
}
