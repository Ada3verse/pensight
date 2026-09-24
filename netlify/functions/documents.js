import { getAdminDb } from './lib/firebaseAdmin.js'
import { requireSession } from './lib/session.js'
import { logServerError } from './lib/errorLog.js'

const COLLECTION_NAME = 'documents'

const MAX_TEXT_LENGTH = 500000
const MAX_FILE_NAME_LENGTH = 300
const VALID_MODES = ['quick', 'ai']
// 수정 요청으로 바꿀 수 있는 필드. nickname 등 소유 정보는 절대 바꿀 수 없다.
const UPDATABLE_FIELDS = ['aiSummary']

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

async function assertOwner(db, docId, nickname) {
  const ref = db.collection(COLLECTION_NAME).doc(docId)
  const snap = await ref.get()
  if (!snap.exists || snap.data().nickname !== nickname) return null
  return ref
}

function parseBody(event) {
  try {
    return JSON.parse(event.body || '{}')
  } catch {
    return null
  }
}

export const handler = async (event) => {
  try {
    // 모든 요청은 세션 토큰이 필요하며, 이후 처리는 토큰으로 확인된 닉네임 기준으로만 한다.
    const session = await requireSession(event)
    if (session.response) return session.response
    const { nickname } = session

    const db = getAdminDb()

    if (event.httpMethod === 'GET') {
      const snapshot = await db.collection(COLLECTION_NAME).where('nickname', '==', nickname).get()
      const docs = snapshot.docs
        .map(serializeDoc)
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      return jsonResponse(200, { documents: docs })
    }

    if (!['POST', 'PATCH', 'DELETE'].includes(event.httpMethod)) {
      return jsonResponse(405, { error: 'Method Not Allowed' })
    }

    const payload = parseBody(event)
    if (!payload) return jsonResponse(400, { error: '잘못된 요청입니다.' })

    if (event.httpMethod === 'POST') {
      const { mode, fileName, extractedText } = payload
      if (
        !VALID_MODES.includes(mode) ||
        typeof fileName !== 'string' ||
        fileName.length > MAX_FILE_NAME_LENGTH ||
        typeof extractedText !== 'string' ||
        extractedText.length > MAX_TEXT_LENGTH
      ) {
        return jsonResponse(400, { error: '잘못된 요청입니다.' })
      }
      const now = new Date()
      const ref = await db.collection(COLLECTION_NAME).add({
        nickname,
        mode,
        fileName,
        extractedText,
        aiSummary: null,
        createdAt: now,
        updatedAt: now,
      })
      return jsonResponse(200, { id: ref.id })
    }

    const { docId, data } = payload
    if (!docId || typeof docId !== 'string') {
      return jsonResponse(400, { error: 'docId가 필요합니다.' })
    }

    if (event.httpMethod === 'PATCH') {
      const ref = await assertOwner(db, docId, nickname)
      if (!ref) return jsonResponse(403, { error: '문서를 수정할 권한이 없습니다.' })
      const update = {}
      for (const field of UPDATABLE_FIELDS) {
        if (typeof data?.[field] === 'string') update[field] = data[field]
      }
      if (Object.keys(update).length === 0) return jsonResponse(400, { error: '잘못된 요청입니다.' })
      await ref.update({ ...update, updatedAt: new Date() })
      return jsonResponse(200, { success: true })
    }

    const ref = await assertOwner(db, docId, nickname)
    if (!ref) return jsonResponse(403, { error: '문서를 삭제할 권한이 없습니다.' })
    await ref.delete()
    return jsonResponse(200, { success: true })
  } catch (err) {
    await logServerError(event, 'documents', '처리되지 않은 오류', err)
    return jsonResponse(500, { error: '문서 처리 중 오류가 발생했습니다. 다시 시도해주세요.' })
  }
}
