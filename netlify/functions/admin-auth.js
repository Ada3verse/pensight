// Netlify 환경변수에 ADMIN_PIN(접두사 VITE_ 없이)을 등록해야 합니다.
// VITE_ 접두사가 붙은 환경변수는 빌드 시 클라이언트 번들에 그대로 노출되므로,
// 관리자 PIN처럼 서버에서만 사용해야 하는 값은 반드시 VITE_ 없이 등록하세요.
// ADMIN_PIN에는 평문 PIN이 아니라 그 PIN의 SHA-256 해시값을 저장한다
// (일반 사용자 PIN과 동일하게 lib/pinHash.js의 hashPin으로 검증).

import { issueAdminToken } from './lib/adminToken.js'
import { hashPin } from './lib/pinHash.js'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    body: JSON.stringify(body),
  }
}

export const handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    }

    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { error: 'Method Not Allowed' })
    }

    let payload
    try {
      payload = JSON.parse(event.body || '{}')
    } catch {
      return jsonResponse(400, { error: '잘못된 요청입니다.' })
    }

    const { pin } = payload
    const adminPinHash = process.env.ADMIN_PIN

    if (!adminPinHash) {
      console.error('[admin-auth] ADMIN_PIN 환경변수가 설정되지 않았습니다.')
      return jsonResponse(500, { error: '관리자 인증을 처리할 수 없습니다.' })
    }

    if (typeof pin === 'string' && hashPin(pin) === adminPinHash) {
      return jsonResponse(200, { success: true, token: issueAdminToken() })
    }

    return jsonResponse(200, { success: false })
  } catch (err) {
    console.error('[admin-auth] 처리되지 않은 오류', err)
    return jsonResponse(500, { error: '관리자 인증 중 오류가 발생했습니다. 다시 시도해주세요.' })
  }
}
