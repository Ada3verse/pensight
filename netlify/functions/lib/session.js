import { createHash, randomUUID } from 'node:crypto'
import { getAdminDb } from './firebaseAdmin.js'

// 로그인(PIN 확인) 성공 시 발급하는 세션 토큰.
// - 토큰 원문은 브라우저 sessionStorage에만 두고, Firestore에는 SHA-256 해시만 저장한다.
//   (users/{닉네임}/sessions/{토큰해시}: expiresAt) — DB가 유출되어도 토큰을 재사용할 수 없다.
// - 닉네임별로 여러 세션을 둘 수 있어 다른 기기 로그인이 기존 세션을 끊지 않는다.
// - 인증이 필요한 함수는 요청 헤더의 토큰을 검증해 "누구의 요청인지"를 서버가 정한다(요청 본문의 닉네임은 신뢰하지 않는다).

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000
export const SESSION_EXPIRED_MESSAGE = '세션이 만료됐습니다. 다시 로그인해주세요.'

const USERS_COLLECTION = 'users'
const SESSIONS_SUBCOLLECTION = 'sessions'

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function sessionsOf(db, nickname) {
  return db.collection(USERS_COLLECTION).doc(nickname).collection(SESSIONS_SUBCOLLECTION)
}

function toMillis(value) {
  return value?.toMillis?.() ?? new Date(value).getTime()
}

// 토큰 형식: base64url(닉네임).UUID — 닉네임은 세션 문서 경로를 찾기 위한 용도일 뿐 권한 근거가 아니다.
export async function issueSession(db, nickname, now = Date.now()) {
  const token = `${Buffer.from(nickname, 'utf8').toString('base64url')}.${randomUUID()}`
  await sessionsOf(db, nickname)
    .doc(hashToken(token))
    .set({ createdAt: new Date(now), expiresAt: new Date(now + SESSION_TTL_MS) })

  // 만료된 세션 정리(실패해도 로그인에는 영향 없음)
  try {
    const expired = await sessionsOf(db, nickname).where('expiresAt', '<', new Date(now)).get()
    if (!expired.empty) {
      const batch = db.batch()
      expired.docs.forEach((docSnap) => batch.delete(docSnap.ref))
      await batch.commit()
    }
  } catch (err) {
    console.error('[session] 만료 세션 정리 실패', err)
  }

  return token
}

/** 유효한 토큰이면 닉네임을, 아니면 null을 돌려준다. */
export async function verifySessionToken(db, token, now = Date.now()) {
  if (typeof token !== 'string') return null
  const dotIndex = token.indexOf('.')
  if (dotIndex <= 0) return null

  let nickname
  try {
    nickname = Buffer.from(token.slice(0, dotIndex), 'base64url').toString('utf8')
  } catch {
    return null
  }
  if (!nickname || nickname.includes('/')) return null

  const [sessionSnap, userSnap] = await Promise.all([
    sessionsOf(db, nickname).doc(hashToken(token)).get(),
    db.collection(USERS_COLLECTION).doc(nickname).get(),
  ])
  if (!sessionSnap.exists || toMillis(sessionSnap.data().expiresAt) <= now) return null
  // PIN 초기화·닉네임 삭제된 사용자의 세션은 남아 있어도 통과시키지 않는다.
  if (!userSnap.exists || !userSnap.data().pin) return null
  return nickname
}

export async function deleteAllSessions(db, nickname) {
  const snapshot = await sessionsOf(db, nickname).get()
  if (snapshot.empty) return
  const batch = db.batch()
  snapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref))
  await batch.commit()
}

function readBearerToken(event) {
  const header = event.headers?.authorization || event.headers?.Authorization || ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

/**
 * 인증이 필요한 함수의 진입부에서 호출한다.
 * @returns {Promise<{ nickname: string } | { response: object }>} 실패 시 그대로 반환할 응답을 돌려준다.
 */
export async function requireSession(event) {
  const unauthorized = () => ({
    response: jsonResponse(401, { error: SESSION_EXPIRED_MESSAGE, code: 'SESSION_EXPIRED' }),
  })

  const token = readBearerToken(event)
  if (!token) return unauthorized()

  try {
    const nickname = await verifySessionToken(getAdminDb(), token)
    return nickname ? { nickname } : unauthorized()
  } catch (err) {
    console.error('[session] 세션 확인 실패', err)
    return { response: jsonResponse(500, { error: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.' }) }
  }
}
