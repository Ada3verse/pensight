import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 1024

const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
})

export class AiError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AiError'
  }
}

const DEFAULT_ERROR_MESSAGE = 'AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'

const PROMPTS = {
  quick: (text) =>
    `다음 텍스트를 한국어로 분석해줘. 반드시 아래 형식으로만 답해줘:\n\n핵심 요약\n(3줄 이내로 요약. 핵심 단어나 개념은 **단어** 형식으로 강조)\n\n주요 키워드\n**키워드1**, **키워드2**, **키워드3**\n\n위 형식 외에 다른 말은 절대 추가하지 마:\n${text}`,
  ai: (text) =>
    `다음 텍스트를 한국어로 분석해줘. 반드시 아래 형식으로만 답해줘. 핵심 요약, 문서 유형, 주요 키워드 세 항목을 예외 없이 모두 출력해야 하고, 어느 항목도 빠뜨리면 안 돼:\n\n핵심 요약\n(3줄 이내로 요약. 핵심 단어나 개념은 **단어** 형식으로 강조)\n\n문서 유형\n(반드시 "진로 상담", "학교폭력 진술", "수행평가", "기타" 이 4가지 중 정확히 하나의 단어만 출력. 다른 설명이나 문장을 덧붙이지 말고 단어 하나만 출력)\n\n주요 키워드\n**키워드1**, **키워드2**, **키워드3**, **키워드4**, **키워드5**\n\n위 형식 외에 다른 말은 절대 추가하지 마:\n${text}`,
}

export async function analyzeDocument(text, mode) {
  const buildPrompt = PROMPTS[mode] ?? PROMPTS.quick

  let response
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: buildPrompt(text) }],
    })
  } catch {
    throw new AiError(DEFAULT_ERROR_MESSAGE)
  }

  const textBlock = response.content.find((block) => block.type === 'text')
  if (!textBlock) {
    throw new AiError(DEFAULT_ERROR_MESSAGE)
  }
  return textBlock.text
}
