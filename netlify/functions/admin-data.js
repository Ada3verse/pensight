import { getAdminDb } from './lib/firebaseAdmin.js'
import { verifyAdminToken } from './lib/adminToken.js'
import { getTodayUsage } from './lib/usage.js'
import { getRecentErrors } from './lib/errorStats.js'
import { createReference, deleteReference, listReferences } from './lib/references.js'
import { deleteAllSessions } from './lib/session.js'
import { logServerError } from './lib/errorLog.js'

const DOCUMENTS_COLLECTION = 'documents'
const USERS_COLLECTION = 'users'

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function serializeDoc(docSnap) {
  const data = docSnap.data()
  return {
    id: docSnap.id,
    ...data,
    createdAt: data.createdAt?.toMillis?.() ?? null,
    updatedAt: data.updatedAt?.toMillis?.() ?? null,
  }
}

async function listAll(db) {
  const snapshot = await db.collection(DOCUMENTS_COLLECTION).get()
  const docs = snapshot.docs.map(serializeDoc).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))

  const counts = new Map()
  for (const docItem of docs) {
    counts.set(docItem.nickname, (counts.get(docItem.nickname) ?? 0) + 1)
  }
  const stats = Array.from(counts.entries())
    .map(([nickname, count]) => ({ nickname, count }))
    .sort((a, b) => b.count - a.count)

  return { documents: docs, stats }
}

async function resetPin(db, nickname) {
  await deleteAllSessions(db, nickname)
  await db.collection(USERS_COLLECTION).doc(nickname).set(
    { pin: null, updatedAt: new Date() },
    { merge: true },
  )
}

async function deleteNickname(db, nickname) {
  await deleteAllSessions(db, nickname)
  const snapshot = await db
    .collection(DOCUMENTS_COLLECTION)
    .where('nickname', '==', nickname)
    .get()

  const batch = db.batch()
  batch.delete(db.collection(USERS_COLLECTION).doc(nickname))
  snapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref))
  await batch.commit()
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' })
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!verifyAdminToken(token)) {
    return jsonResponse(401, { error: '인증이 만료되었거나 유효하지 않습니다.' })
  }

  let payload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return jsonResponse(400, { error: '잘못된 요청입니다.' })
  }

  const { action, nickname } = payload

  try {
    const db = getAdminDb()

    if (action === 'listAll') {
      const result = await listAll(db)
      return jsonResponse(200, result)
    }

    if (action === 'usageToday') {
      return jsonResponse(200, await getTodayUsage(db))
    }

    if (action === 'errorsRecent') {
      return jsonResponse(200, await getRecentErrors(db))
    }

    if (action === 'referencesList') {
      return jsonResponse(200, { references: await listReferences(db, { scope: 'shared' }) })
    }

    if (action === 'referenceCreate') {
      const result = await createReference(db, { ...payload, scope: 'shared' })
      if (!result.ok) return jsonResponse(result.status, { error: result.message })
      return jsonResponse(200, { id: result.id, fileStored: result.fileStored })
    }

    if (action === 'referenceDelete') {
      if (typeof payload.id !== 'string' || !payload.id) return jsonResponse(400, { error: '잘못된 요청입니다.' })
      const deleted = await deleteReference(db, { id: payload.id, scope: 'shared' })
      return deleted ? jsonResponse(200, { success: true }) : jsonResponse(404, { error: '자료를 찾을 수 없습니다.' })
    }

    if (action === 'resetPin') {
      if (!nickname) return jsonResponse(400, { error: '닉네임이 필요합니다.' })
      await resetPin(db, nickname)
      return jsonResponse(200, { success: true })
    }

    if (action === 'deleteNickname') {
      if (!nickname) return jsonResponse(400, { error: '닉네임이 필요합니다.' })
      await deleteNickname(db, nickname)
      return jsonResponse(200, { success: true })
    }

    return jsonResponse(400, { error: '알 수 없는 요청입니다.' })
  } catch (err) {
    await logServerError(event, 'admin-data', '처리되지 않은 오류', err)
    return jsonResponse(500, { error: '처리 중 오류가 발생했습니다. 다시 시도해주세요.' })
  }
}
