import { MAX_FILE_SIZE_BYTES, validateFileMeta } from '../../../src/utils/fileValidationRules.js'

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png']

// ocr.js가 받는 imageBase64는 원본 업로드 파일(jpg/png)이거나
// pdf.js로 렌더링된 PDF 페이지 이미지(png)다. 어느 쪽이든 Vision API에
// 넘기기 전에 실제로 이미지가 맞는지, 선언한 MIME과 매직바이트가
// 일치하는지, 크기가 과도하지 않은지 서버에서 다시 확인한다.
export function validateImagePayload({ mimeType, imageBase64 }) {
  if (typeof mimeType !== 'string' || !IMAGE_MIME_TYPES.includes(mimeType)) {
    return { ok: false, reason: 'mime' }
  }
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    return { ok: false, reason: 'missing' }
  }

  let buffer
  try {
    buffer = Buffer.from(imageBase64, 'base64')
  } catch {
    return { ok: false, reason: 'decode' }
  }

  if (buffer.length === 0) return { ok: false, reason: 'decode' }
  if (buffer.length > MAX_FILE_SIZE_BYTES) return { ok: false, reason: 'size' }

  const fakeFileName = mimeType === 'image/png' ? 'upload.png' : 'upload.jpg'
  return validateFileMeta({
    fileName: fakeFileName,
    mimeType,
    size: buffer.length,
    headerBytes: buffer.subarray(0, 8),
  })
}
