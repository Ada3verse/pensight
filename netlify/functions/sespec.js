import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 1024

function buildPrompt({ extractedText, commonKeywords, studentAlias, teacherExampleStyle }) {
  const styleNote = teacherExampleStyle
    ? `\n참고할 문체 예시:\n${teacherExampleStyle}`
    : ''

  return `다음은 학생의 수행평가 활동 내용과 교사가 제공한 공통 키워드입니다.
아래 조건에 맞게 교과 세부능력 및 특기사항(세특)을 작성해줘.

공통 키워드: ${commonKeywords}
학생 활동 내용: ${extractedText}
학생 익명 태그: ${studentAlias}

작성 조건:
- 분량: 300~400자 내외
- 문체: 학교 생활기록부 세특 문체로 작성 (예: ~함. ~임. ~됨. 으로 종결)
- 활동명 → 구체적 행동 → 결과/성장 → 역량 함양 순서로 서술
- 학생을 지칭할 때 '본 학생' 또는 익명 태그 사용 금지, 서술형으로만 작성
- 다른 학생과 중복되지 않도록 학생 고유 활동 내용 반영
- 세특 텍스트만 출력하고 다른 설명은 절대 추가하지 마${styleNote}`
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' })
  }

  let payload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return jsonResponse(400, { error: '잘못된 요청입니다.' })
  }

  const { extractedText, commonKeywords, studentAlias, teacherExampleStyle } = payload
  if (!extractedText || !commonKeywords || !studentAlias) {
    return jsonResponse(400, { error: '필수 항목이 누락되었습니다.' })
  }

  const apiKey = process.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) {
    return jsonResponse(500, { error: 'AI API 키가 설정되지 않았습니다.' })
  }

  const client = new Anthropic({ apiKey })

  let response
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: buildPrompt({ extractedText, commonKeywords, studentAlias, teacherExampleStyle }),
        },
      ],
    })
  } catch {
    return jsonResponse(502, { error: '세특 생성 중 오류가 발생했습니다.' })
  }

  const textBlock = response.content.find((block) => block.type === 'text')
  if (!textBlock) {
    return jsonResponse(502, { error: '세특 생성 중 오류가 발생했습니다.' })
  }

  return jsonResponse(200, { sespec: textBlock.text.trim() })
}
