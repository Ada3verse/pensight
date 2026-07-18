// Netlify 환경변수에 ADMIN_PIN(접두사 VITE_ 없이)을 등록해야 합니다.
// VITE_ 접두사가 붙은 환경변수는 빌드 시 클라이언트 번들에 그대로 노출되므로,
// 관리자 PIN처럼 서버에서만 사용해야 하는 값은 반드시 VITE_ 없이 등록하세요.

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

function generateToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const handler = async (event) => {
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
  const adminPin = process.env.ADMIN_PIN

  if (!adminPin) {
    return jsonResponse(500, { error: '관리자 PIN이 설정되지 않았습니다.' })
  }

  if (pin === adminPin) {
    return jsonResponse(200, { success: true, token: generateToken() })
  }

  return jsonResponse(200, { success: false })
}
