import { getAdminDb } from './lib/firebaseAdmin.js'
import { hashPin } from './lib/pinHash.js'

const USERS_COLLECTION = 'users'

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' })
  }

  let payload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return jsonResponse(400, { error: '잘못된 요청입니다.' })
  }

  const { action, nickname, pin } = payload
  if (typeof nickname !== 'string' || !nickname.trim()) {
    return jsonResponse(400, { error: '닉네임이 필요합니다.' })
  }

  try {
    const db = getAdminDb()
    const userRef = db.collection(USERS_COLLECTION).doc(nickname)

    if (action === 'checkExists') {
      const userSnap = await userRef.get()
      const exists = userSnap.exists && Boolean(userSnap.data().pin)
      return jsonResponse(200, { exists })
    }

    if (action === 'register') {
      if (typeof pin !== 'string' || pin.length !== 4) {
        return jsonResponse(400, { error: 'PIN은 4자리 숫자여야 합니다.' })
      }
      const userSnap = await userRef.get()
      const hashedPin = hashPin(pin)
      const existingPin = userSnap.exists ? userSnap.data().pin : null

      if (existingPin) {
        if (existingPin !== hashedPin) {
          return jsonResponse(200, { success: false, error: 'PIN_MISMATCH' })
        }
        return jsonResponse(200, { success: true })
      }

      await userRef.set(
        {
          nickname,
          pin: hashedPin,
          createdAt: userSnap.exists ? userSnap.data().createdAt : new Date(),
          updatedAt: new Date(),
        },
        { merge: true },
      )
      return jsonResponse(200, { success: true })
    }

    if (action === 'verify') {
      if (typeof pin !== 'string') {
        return jsonResponse(400, { error: 'PIN이 필요합니다.' })
      }
      const userSnap = await userRef.get()
      const ok = userSnap.exists && userSnap.data().pin === hashPin(pin)
      return jsonResponse(200, { ok })
    }

    return jsonResponse(400, { error: '알 수 없는 요청입니다.' })
  } catch (err) {
    console.error('[auth] 처리되지 않은 오류', err)
    return jsonResponse(500, { error: '처리 중 오류가 발생했습니다. 다시 시도해주세요.' })
  }
}
