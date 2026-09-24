import { authedFetch } from './session'
import { isLimitResponse, readLimitMessage } from './usageLimit'

const AI_FUNCTION_URL = '/.netlify/functions/ai'

export class AiError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AiError'
  }
}

const DEFAULT_ERROR_MESSAGE = 'AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'

export async function analyzeDocument(text, mode, docType, aliases = []) {
  let response
  try {
    response = await authedFetch(AI_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, mode, docType, aliases }),
    })
  } catch {
    throw new AiError(DEFAULT_ERROR_MESSAGE)
  }

  if (isLimitResponse(response)) {
    throw new AiError(await readLimitMessage(response))
  }

  const data = await response.json().catch(() => null)
  if (!response.ok || !data || data.error) {
    throw new AiError(DEFAULT_ERROR_MESSAGE)
  }

  return data.result
}
