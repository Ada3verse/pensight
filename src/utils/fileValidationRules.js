// 브라우저(src/utils/fileValidation.js)와 Netlify Functions
// (netlify/functions/lib/fileValidation.js) 양쪽에서 그대로 가져다 쓰는
// 순수 규칙 모듈. DOM/Node 전용 API를 쓰지 않는다.

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 파일 1개당 10MB
export const MAX_TOTAL_SIZE_BYTES = 50 * 1024 * 1024 // 다중 업로드 합산 50MB

export const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf']

const EXTENSION_MIME_MAP = {
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  pdf: ['application/pdf'],
}

// 확장자 위조 방지용 매직 바이트(파일 시그니처). PDF는 "%PDF-".
const SIGNATURES = [
  { kind: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { kind: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { kind: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
]

export function getExtension(fileName) {
  const match = /\.([^.]+)$/.exec(fileName || '')
  return match ? match[1].toLowerCase() : ''
}

export function detectSignatureKind(headerBytes) {
  if (!headerBytes) return null
  for (const sig of SIGNATURES) {
    if (headerBytes.length >= sig.bytes.length && sig.bytes.every((b, i) => headerBytes[i] === b)) {
      return sig.kind
    }
  }
  return null
}

/**
 * @param {object} meta
 * @param {string} meta.fileName
 * @param {string} [meta.mimeType] - 브라우저/클라이언트가 보고한 MIME 타입
 * @param {number} [meta.size] - 바이트 크기
 * @param {Uint8Array|number[]} [meta.headerBytes] - 파일 앞부분 바이트(매직 넘버 확인용)
 * @returns {{ ok: true } | { ok: false, reason: 'extension'|'mime'|'size'|'signature' }}
 */
export function validateFileMeta({ fileName, mimeType, size, headerBytes }) {
  const rawExtension = getExtension(fileName)
  const extension = rawExtension === 'jpeg' ? 'jpg' : rawExtension

  if (!ALLOWED_EXTENSIONS.includes(rawExtension)) {
    return { ok: false, reason: 'extension' }
  }

  if (mimeType && !EXTENSION_MIME_MAP[rawExtension].includes(mimeType)) {
    return { ok: false, reason: 'mime' }
  }

  if (typeof size === 'number' && size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, reason: 'size' }
  }

  if (headerBytes) {
    const signatureKind = detectSignatureKind(headerBytes)
    if (!signatureKind || signatureKind !== extension) {
      return { ok: false, reason: 'signature' }
    }
  }

  return { ok: true }
}
