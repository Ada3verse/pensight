import { createHash } from 'node:crypto'

// 기존에 클라이언트(src/utils/pinService.js)에서 crypto.subtle로 계산하던
// SHA-256(pin) 값과 동일한 결과를 내야 기존에 저장된 해시와 호환된다.
export function hashPin(pin) {
  return createHash('sha256').update(pin).digest('hex')
}
