import { createHmac, timingSafeEqual } from 'node:crypto'

const TOKEN_TTL_MS = 30 * 60 * 1000

function sign(expiresAt) {
  // ADMIN_PIN은 PIN의 SHA-256 해시값이 저장되어 있으며, 여기서는 그 값을
  // HMAC 서명 키로 재사용한다(평문 PIN보다 엔트로피가 커서 서명 키로도 더 안전하다).
  const secret = process.env.ADMIN_PIN
  return createHmac('sha256', secret).update(String(expiresAt)).digest('hex')
}

export function issueAdminToken() {
  const expiresAt = Date.now() + TOKEN_TTL_MS
  return `${expiresAt}.${sign(expiresAt)}`
}

export function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') return false
  const [expiresAtStr, mac] = token.split('.')
  const expiresAt = Number(expiresAtStr)
  if (!expiresAt || !mac || Date.now() > expiresAt) return false

  const expected = sign(expiresAt)
  const macBuf = Buffer.from(mac)
  const expectedBuf = Buffer.from(expected)
  if (macBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(macBuf, expectedBuf)
}
