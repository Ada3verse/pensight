import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 4096

const buildPrompt = (text) =>
  `다음 텍스트에서 사람 이름을 찾아 가/나/다 순서로 치환해줘.

규칙:
- 텍스트에 등장하는 순서대로 첫 번째 인물=가, 두 번째=나, 세 번째=다, 네 번째=라... 순으로 치환
- 같은 인물이 여러 번 나오면 동일한 기호로 통일
- 이름 외 다른 개인정보(전화번호, 학번, 주소, 생년월일)는 기존처럼 마스킹:
  전화번호 → 010-****-****
  학번/번호 → ******
  생년월일 → ****년 **월 **일
  주소 → ○○시 ○○구 ***
- 결과는 두 부분으로 나눠서 출력:
  [변환된 텍스트]
  실제 변환된 내용
  [인물 매핑표]
  가: 홍길동
  나: 김철수
  다: 이영희
- 이름이 없으면 [인물 매핑표] 없이 변환된 텍스트만 출력
- 위 형식 외에 다른 설명은 절대 추가하지 마

다음은 변환할 텍스트입니다:
${text}`

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

    const { text } = payload
    if (!text) {
      return jsonResponse(200, { text: text ?? '', success: false })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.error('[mask] ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.')
      return jsonResponse(200, { text, success: false })
    }

    const client = new Anthropic({ apiKey })

    let response
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: buildPrompt(text) }],
      })
    } catch (err) {
      console.error('[mask] Anthropic API 호출 실패', err)
      return jsonResponse(200, { text, success: false })
    }

    const textBlock = response.content.find((block) => block.type === 'text')
    if (!textBlock) {
      console.error('[mask] Anthropic 응답에 text 블록이 없음', response)
      return jsonResponse(200, { text, success: false })
    }

    return jsonResponse(200, { text: textBlock.text, success: true })
  } catch (err) {
    console.error('[mask] 처리되지 않은 오류', err)
    return jsonResponse(200, { text: '', success: false })
  }
}
