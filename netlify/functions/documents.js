import { getAdminDb } from './lib/firebaseAdmin.js'

const COLLECTION_NAME = 'documents'

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

async function assertNicknameMatch(db, docId, nickname) {
  const ref = db.collection(COLLECTION_NAME).doc(docId)
  const snap = await ref.get()
  if (!snap.exists || snap.data().nickname !== nickname) return null
  return ref
}

export const handler = async (event) => {
  try {
    const db = getAdminDb()

    if (event.httpMethod === 'GET') {
      const nickname = event.queryStringParameters?.nickname
      if (!nickname) return jsonResponse(400, { error: '닉네임이 필요합니다.' })

      const snapshot = await db.collection(COLLECTION_NAME).where('nickname', '==', nickname).get()
      const docs = snapshot.docs
        .map(serializeDoc)
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      return jsonResponse(200, { documents: docs })
    }

    if (event.httpMethod !== 'PATCH' && event.httpMethod !== 'DELETE') {
      return jsonResponse(405, { error: 'Method Not Allowed' })
    }

    let payload
    try {
      payload = JSON.parse(event.body || '{}')
    } catch {
      return jsonResponse(400, { error: '잘못된 요청입니다.' })
    }

    const { docId, nickname, data } = payload
    if (!docId || !nickname) {
      return jsonResponse(400, { error: 'docId와 닉네임이 필요합니다.' })
    }

    if (event.httpMethod === 'PATCH') {
      const ref = await assertNicknameMatch(db, docId, nickname)
      if (!ref) return jsonResponse(403, { error: '문서를 수정할 권한이 없습니다.' })
      await ref.update({ ...(data ?? {}), updatedAt: new Date() })
      return jsonResponse(200, { success: true })
    }

    const ref = await assertNicknameMatch(db, docId, nickname)
    if (!ref) return jsonResponse(403, { error: '문서를 삭제할 권한이 없습니다.' })
    await ref.delete()
    return jsonResponse(200, { success: true })
  } catch (err) {
    console.error('[documents] 처리되지 않은 오류', err)
    return jsonResponse(500, { error: '문서 처리 중 오류가 발생했습니다. 다시 시도해주세요.' })
  }
}
