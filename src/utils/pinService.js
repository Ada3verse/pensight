async function sha256Hex(text) {
  const data = new TextEncoder().encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function hashPin(pin) {
  return sha256Hex(pin)
}

export async function verifyPin(pin, hashedPin) {
  if (!hashedPin) return false
  const hash = await hashPin(pin)
  return hash === hashedPin
}
