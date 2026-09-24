import { getAdminDb } from './firebaseAdmin.js'
import { requireSession } from './session.js'

// 외부 API(Claude / Google Cloud Vision) 비용 폭주를 막기 위한 일일 사용량 제한.
// - usage/{YYYYMMDD}_{닉네임}: 닉네임별 당일 사용량
// - usage/{YYYYMMDD}: 당일 전체 합산 (닉네임 문서는 항상 "_"를 포함하므로 키가 겹치지 않는다)
// 날짜는 한국 시간(자정) 기준이라 날짜가 바뀌면 자연히 새 문서가 만들어진다.

export const USAGE_COLLECTION = 'usage'

// kind: vision(OCR) / ai(AI 분석) / sespec(세특 생성) / mask(개인정보 마스킹, Claude 호출)
export const USER_DAILY_LIMITS = { vision: 50, ai: 10, sespec: 3, mask: 20 }
export const TOTAL_DAILY_LIMITS = { vision: 200, claude: 100 }

export const USER_LIMIT_MESSAGE = '오늘 사용 한도에 도달했습니다. 내일 다시 시도해주세요.'
export const TOTAL_LIMIT_MESSAGE = '현재 서버가 혼잡합니다. 잠시 후 다시 시도해주세요.'

const UNKNOWN_USER_MESSAGE = '인증 정보를 확인할 수 없습니다. 처음 화면에서 다시 시작해주세요.'
const USAGE_FAILURE_MESSAGE = '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export function todayKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type) => parts.find((part) => part.type === type).value
  return `${get('year')}${get('month')}${get('day')}`
}

// Firestore 문서 ID에는 "/"를 쓸 수 없어 인코딩한다.
export function userUsageDocId(dateKey, nickname) {
  return `${dateKey}_${nickname.replace(/\//g, '%2F')}`
}

function totalFieldFor(kind) {
  return kind === 'vision' ? 'vision' : 'claude'
}

/**
 * 사용량을 확인하고, 한도 이내이면 1회 차감(기록)한다. 확인과 기록은 하나의 트랜잭션이다.
 * @returns {Promise<{ok: true} | {ok: false, reason: 'unknown_user' | 'user_limit' | 'total_limit'}>}
 */
export async function consumeUsage(db, kind, nickname, now = new Date()) {
  const userLimit = USER_DAILY_LIMITS[kind]
  if (!userLimit) throw new Error(`알 수 없는 사용량 종류: ${kind}`)

  const dateKey = todayKey(now)
  const userRef = db.collection('users').doc(nickname)
  const usageRef = db.collection(USAGE_COLLECTION).doc(userUsageDocId(dateKey, nickname))
  const totalRef = db.collection(USAGE_COLLECTION).doc(dateKey)
  const totalField = totalFieldFor(kind)

  return db.runTransaction(async (tx) => {
    const [userSnap, usageSnap, totalSnap] = await tx.getAll(userRef, usageRef, totalRef)

    // 존재하지 않는 닉네임으로 사용량 문서를 만들어 닉네임별 한도를 우회하는 것을 막는다.
    if (!userSnap.exists || !userSnap.data().pin) return { ok: false, reason: 'unknown_user' }

    const usage = usageSnap.exists ? usageSnap.data() : {}
    const total = totalSnap.exists ? totalSnap.data() : {}

    if ((usage[kind] ?? 0) >= userLimit) return { ok: false, reason: 'user_limit' }
    if ((total[totalField] ?? 0) >= TOTAL_DAILY_LIMITS[totalField]) {
      return { ok: false, reason: 'total_limit' }
    }

    tx.set(
      usageRef,
      { nickname, date: dateKey, [kind]: (usage[kind] ?? 0) + 1, updatedAt: new Date() },
      { merge: true },
    )
    tx.set(
      totalRef,
      {
        date: dateKey,
        [totalField]: (total[totalField] ?? 0) + 1,
        [kind]: (total[kind] ?? 0) + 1,
        updatedAt: new Date(),
      },
      { merge: true },
    )
    return { ok: true }
  })
}

/**
 * 각 API 함수가 외부 호출 직전에 부른다(세션 확인 포함). 통과하면 null, 아니면 그대로 반환할 응답을 돌려준다.
 * 사용량 확인 자체가 실패하면 비용 보호를 위해 요청을 차단한다(fail closed).
 */
export async function guardUsage(kind, event) {
  // 닉네임은 요청 본문이 아니라 세션 토큰에서 확인한다.
  const session = await requireSession(event)
  if (session.response) return session.response
  const { nickname } = session

  let result
  try {
    result = await consumeUsage(getAdminDb(), kind, nickname)
  } catch (err) {
    console.error('[usage] 사용량 확인 실패', err)
    return jsonResponse(500, { error: USAGE_FAILURE_MESSAGE })
  }

  if (result.ok) return null
  if (result.reason === 'unknown_user') return jsonResponse(401, { error: UNKNOWN_USER_MESSAGE })
  if (result.reason === 'user_limit') {
    return jsonResponse(429, { error: USER_LIMIT_MESSAGE, code: 'USER_LIMIT' })
  }
  return jsonResponse(429, { error: TOTAL_LIMIT_MESSAGE, code: 'TOTAL_LIMIT' })
}

export async function getTodayUsage(db, now = new Date()) {
  const dateKey = todayKey(now)
  const totalSnap = await db.collection(USAGE_COLLECTION).doc(dateKey).get()
  const total = totalSnap.exists ? totalSnap.data() : {}
  const usersSnap = await db.collection(USAGE_COLLECTION).where('date', '==', dateKey).get()

  const users = usersSnap.docs
    .filter((docSnap) => docSnap.id !== dateKey)
    .map((docSnap) => {
      const data = docSnap.data()
      return {
        nickname: data.nickname,
        vision: data.vision ?? 0,
        ai: data.ai ?? 0,
        sespec: data.sespec ?? 0,
        mask: data.mask ?? 0,
      }
    })
    .sort((a, b) => b.vision + b.ai + b.sespec + b.mask - (a.vision + a.ai + a.sespec + a.mask))

  return {
    date: dateKey,
    total: { vision: total.vision ?? 0, claude: total.claude ?? 0 },
    limits: { user: USER_DAILY_LIMITS, total: TOTAL_DAILY_LIMITS },
    users,
  }
}
