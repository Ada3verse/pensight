// 로그인(PIN 확인) 후 서버가 발급한 세션 토큰을 sessionStorage에 보관하고,
// 인증이 필요한 모든 API 요청에 Authorization 헤더로 실어 보낸다.
// 서버가 401을 돌려주면(토큰 없음·만료·무효) 토큰을 지우고 로그인 화면으로 돌아가도록 알린다.

const SESSION_TOKEN_KEY = 'pensight_session_token'

export const SESSION_EXPIRED_EVENT = 'pensight:session-expired'
export const SESSION_EXPIRED_MESSAGE = '세션이 만료됐습니다. 다시 로그인해주세요.'

export function getSessionToken() {
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setSessionToken(token) {
  try {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token)
  } catch {
    // 저장소를 쓸 수 없으면 이후 요청이 401이 되어 다시 로그인하게 된다.
  }
}

export function clearSessionToken() {
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY)
  } catch {
    // 무시
  }
}

export async function authedFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${getSessionToken()}` },
  })
  if (response.status === 401) {
    clearSessionToken()
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
  }
  return response
}
