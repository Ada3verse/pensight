// 서버(netlify/functions/lib/usage.js)가 일일 사용량 한도 초과 시 429와 함께 내려주는
// 안내 문구("오늘 사용 한도에 도달했습니다..." 또는 "현재 서버가 혼잡합니다...")를 그대로 사용자에게 보여준다.
const FALLBACK_LIMIT_MESSAGE = '오늘 사용 한도에 도달했습니다. 내일 다시 시도해주세요.'

export function isLimitResponse(response) {
  return response.status === 429
}

export async function readLimitMessage(response) {
  const data = await response.json().catch(() => null)
  return data?.error || FALLBACK_LIMIT_MESSAGE
}
