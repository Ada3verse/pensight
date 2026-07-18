import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 4096

const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
})

const buildPrompt = (text) =>
  `다음 텍스트에서 개인정보를 찾아 마스킹해줘.\n마스킹 규칙:\n- 이름 (2~4글자 한국어 고유명사): ○○○으로 대체\n- 학번/번호 (숫자 조합): ******으로 대체\n- 전화번호: 010-****-****으로 대체\n- 생년월일: ****년 **월 **일로 대체\n- 주소 (○○시/도 이하 상세주소): ○○시 ○○구 ***으로 대체\n마스킹된 텍스트만 출력하고 다른 설명은 절대 추가하지 마:\n${text}`

export async function maskPersonalInfo(text) {
  if (!text) return { text, success: false }

  let response
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: buildPrompt(text) }],
    })
  } catch {
    return { text, success: false }
  }

  const textBlock = response.content.find((block) => block.type === 'text')
  if (!textBlock) return { text, success: false }
  return { text: textBlock.text, success: true }
}
