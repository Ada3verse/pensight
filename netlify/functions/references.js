import { getAdminDb } from './lib/firebaseAdmin.js'
import { requireSession } from './lib/session.js'
import { logServerError } from './lib/errorLog.js'
import { createReference, deleteReference, listReferences } from './lib/references.js'

// 교사 본인의 참고자료(수행평가 채점 기준표, 세특 예시문). 세션 토큰의 닉네임에만 연결된다.

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

const FAILURE_MESSAGE = '참고자료를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'

export const handler = async (event) => {
  try {
    const session = await requireSession(event)
    if (session.response) return session.response
    const { nickname } = session
    const db = getAdminDb()

    if (event.httpMethod === 'GET') {
      return jsonResponse(200, { references: await listReferences(db, { scope: 'personal', nickname }) })
    }

    if (event.httpMethod !== 'POST' && event.httpMethod !== 'DELETE') {
      return jsonResponse(405, { error: 'Method Not Allowed' })
    }

    let payload
    try {
      payload = JSON.parse(event.body || '{}')
    } catch {
      return jsonResponse(400, { error: '잘못된 요청입니다.' })
    }

    if (event.httpMethod === 'POST') {
      const result = await createReference(db, { ...payload, scope: 'personal', nickname })
      if (!result.ok) return jsonResponse(result.status, { error: result.message })
      return jsonResponse(200, { id: result.id, fileStored: result.fileStored })
    }

    if (typeof payload.id !== 'string' || !payload.id) return jsonResponse(400, { error: '잘못된 요청입니다.' })
    const deleted = await deleteReference(db, { id: payload.id, scope: 'personal', nickname })
    if (!deleted) return jsonResponse(403, { error: '자료를 삭제할 권한이 없습니다.' })
    return jsonResponse(200, { success: true })
  } catch (err) {
    await logServerError(event, 'references', '처리되지 않은 오류', err)
    return jsonResponse(500, { error: FAILURE_MESSAGE })
  }
}
