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

// AI 상담 추천(학교폭력·진로 문서 전용). 분석과 별도의 호출이며 교사가 버튼을 눌렀을 때만 부른다.
export async function requestCounsel(text, docType, summary) {
  let response
  try {
    response = await authedFetch('/.netlify/functions/counsel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, docType, summary }),
    })
  } catch {
    throw new AiError('네트워크 연결을 확인하고 잠시 후 다시 시도해주세요.')
  }

  if (isLimitResponse(response)) {
    throw new AiError(await readLimitMessage(response))
  }

  const data = await response.json().catch(() => null)
  if (!response.ok || !data || data.error) {
    throw new AiError(data?.error || '상담 추천을 만드는 중 오류가 발생했습니다. 다시 시도해주세요.')
  }
  return data.result
}

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
