import { getAdminDb } from './lib/firebaseAdmin.js'
import { recordError, resolveNickname } from './lib/errorLog.js'

// 프론트에서 잡힌 처리되지 않은 오류(unhandledrejection, onerror)를 받아 Firestore에 기록한다.
// 로그인 전 화면의 오류도 남길 수 있도록 세션 토큰은 선택이며, 있으면 닉네임을 함께 기록한다.
// 항상 204로 응답해 오류 보고가 화면 동작에 영향을 주지 않게 한다.

function noContent() {
  return { statusCode: 204, body: '' }
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: '' }

  try {
    const payload = JSON.parse(event.body || '{}')
    if (typeof payload.message !== 'string' || !payload.message) return noContent()

    const db = getAdminDb()
    await recordError(db, {
      source: 'client',
      location: payload.location,
      message: payload.message,
      stack: payload.stack,
      path: payload.url,
      nickname: await resolveNickname(db, event),
      page: payload.page,
      step: payload.step,
    })
  } catch (err) {
    console.error('[log-error] 오류 기록 실패', err)
  }
  return noContent()
}
