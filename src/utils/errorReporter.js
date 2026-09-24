// 처리되지 않은 프론트 오류(window.onerror, unhandledrejection)를 서버(log-error 함수)로 보내 Firestore에 기록한다.
// 오류 보고 자체는 실패해도 화면 동작에 영향을 주지 않는다.
import { getSessionToken } from './session'

const LOG_ERROR_URL = '/.netlify/functions/log-error'
const MAX_REPORTS_PER_SESSION = 10
const DUPLICATE_WINDOW_MS = 30000

// 발생 당시의 화면 정보(App/ResultPage 등이 갱신). 오류 기록의 "현재 페이지/단계"로 쓰인다.
const context = { page: '', step: '' }
const recent = new Map()
let reportCount = 0

export function setErrorContext(partial) {
  Object.assign(context, partial)
}

function isIgnorable(message) {
  // 브라우저가 던지는 무해한 알림성 오류
  return /ResizeObserver loop/.test(message)
}

export async function reportError({ message, stack, location }) {
  try {
    const text = String(message || '').slice(0, 500)
    if (!text || isIgnorable(text)) return
    if (reportCount >= MAX_REPORTS_PER_SESSION) return

    const key = `${text}|${location}`
    const now = Date.now()
    if (now - (recent.get(key) ?? 0) < DUPLICATE_WINDOW_MS) return
    recent.set(key, now)
    reportCount += 1

    const token = getSessionToken()
    await fetch(LOG_ERROR_URL, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        message: text,
        stack: stack ? String(stack).slice(0, 4000) : '',
        location: location || '',
        url: window.location.pathname + window.location.hash,
        page: context.page,
        step: context.step,
      }),
    })
  } catch {
    // 오류 보고 실패는 무시한다(무한 루프 방지).
  }
}

function shortLocation(filename, line, column) {
  if (!filename) return ''
  const path = filename.replace(window.location.origin, '')
  return `${path}:${line ?? 0}:${column ?? 0}`
}

export function installGlobalErrorHandlers() {
  window.addEventListener('error', (event) => {
    // 이미지·스크립트 로딩 실패 같은 리소스 오류는 제외하고 실행 중 오류만 기록한다.
    if (event.target && event.target !== window) return
    reportError({
      message: event.error?.message || event.message,
      stack: event.error?.stack,
      location: shortLocation(event.filename, event.lineno, event.colno),
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    reportError({
      message: reason?.message ?? String(reason),
      stack: reason?.stack,
      location: 'unhandledrejection',
    })
  })
}
