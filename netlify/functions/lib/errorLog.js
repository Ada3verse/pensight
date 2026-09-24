import { getAdminDb } from './firebaseAdmin.js'
import { verifySessionToken } from './session.js'

// 운영 중 오류를 Firestore errors 컬렉션에 기록한다(외부 모니터링 서비스 없이 관리자 페이지에서 확인).
// - 스택 트레이스는 저장하지만 사용자 응답에는 절대 포함하지 않는다(응답은 각 함수의 일반 안내 문구만 사용).
// - 요청 본문(학생 문서 내용 등)은 저장하지 않는다.
// - 오류 기록 자체가 실패해도 원래 요청 처리에 영향을 주지 않는다.

export const ERRORS_COLLECTION = 'errors'
const COUNTERS_COLLECTION = 'errorCounters'
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000 // expiresAt 필드에 Firestore TTL 정책을 걸면 30일 뒤 자동 삭제된다.
const DAILY_CAP = { server: 1000, client: 300 } // 오류 폭주·악의적 요청으로 기록이 무한히 쌓이는 것을 막는다.

const MAX_MESSAGE = 500
const MAX_STACK = 4000
const MAX_SHORT = 300

function clip(value, max) {
  if (value === undefined || value === null) return ''
  return String(value).slice(0, max)
}

function dateKey(now) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '')
}

/**
 * 오류 1건을 기록한다. 일일 상한을 넘으면 기록하지 않는다.
 * @param {object} entry { source, functionName?, location?, message, stack?, path?, nickname?, page?, step? }
 */
export async function recordError(db, entry, now = new Date()) {
  const counterRef = db.collection(COUNTERS_COLLECTION).doc(dateKey(now))
  const field = entry.source === 'client' ? 'client' : 'server'

  const allowed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef)
    const count = snap.exists ? (snap.data()[field] ?? 0) : 0
    if (count >= DAILY_CAP[field]) return false
    tx.set(counterRef, { [field]: count + 1 }, { merge: true })
    return true
  })
  if (!allowed) return false

  await db.collection(ERRORS_COLLECTION).add({
    source: field,
    functionName: clip(entry.functionName, MAX_SHORT),
    location: clip(entry.location, MAX_SHORT),
    message: clip(entry.message, MAX_MESSAGE),
    stack: clip(entry.stack, MAX_STACK),
    path: clip(entry.path, MAX_SHORT),
    nickname: entry.nickname ? clip(entry.nickname, 100) : null,
    page: clip(entry.page, MAX_SHORT),
    step: clip(entry.step, MAX_SHORT),
    createdAt: now,
    expiresAt: new Date(now.getTime() + RETENTION_MS),
  })
  return true
}

function readBearerToken(event) {
  const header = event?.headers?.authorization || event?.headers?.Authorization || ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

/** 요청의 세션 토큰에서 닉네임을 확인한다. 실패하거나 토큰이 없으면 null. */
export async function resolveNickname(db, event) {
  const token = readBearerToken(event)
  if (!token) return null
  try {
    return await verifySessionToken(db, token)
  } catch {
    return null
  }
}

// detail: Error면 메시지·스택을 쓰고, 숫자·문자열은 덧붙이며, 그 외 객체는 저장하지 않는다(응답 본문 등 사용자 데이터 유입 방지).
function describe(message, detail) {
  if (detail instanceof Error) return { message: `${message}: ${detail.message}`, stack: detail.stack }
  if (typeof detail === 'number' || typeof detail === 'string') return { message: `${message}: ${detail}` }
  if (detail && typeof detail.message === 'string') return { message: `${message}: ${detail.message}` }
  return { message }
}

/**
 * Netlify Function에서 5xx(또는 조용히 실패 처리)하는 지점에서 호출한다. console.error를 대체한다.
 */
export async function logServerError(event, functionName, message, detail) {
  console.error(`[${functionName}] ${message}`, detail ?? '')
  try {
    const db = getAdminDb()
    const { message: fullMessage, stack } = describe(message, detail)
    await recordError(db, {
      source: 'server',
      functionName,
      message: fullMessage,
      stack,
      path: event?.path,
      nickname: await resolveNickname(db, event),
    })
  } catch (loggingError) {
    console.error('[errorLog] 오류 기록 실패', loggingError)
  }
}
