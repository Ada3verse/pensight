import {
  MAX_FILE_SIZE_BYTES,
  MAX_TOTAL_SIZE_BYTES,
  validateFileMeta,
} from './fileValidationRules.js'

const HEADER_BYTE_LENGTH = 8

const REASON_MESSAGES = {
  extension: '지원하지 않는 파일 형식입니다. (jpg, png, pdf만 업로드할 수 있습니다)',
  mime: '파일 확장자와 실제 파일 형식이 일치하지 않습니다.',
  size: '파일 크기가 10MB를 초과했습니다.',
  signature: '파일 내용을 확인할 수 없습니다. 확장자가 실제 파일과 다른 것 같습니다.',
  'total-size': '여러 파일의 합산 용량이 50MB를 초과해 추가할 수 없습니다.',
}

async function readHeaderBytes(file) {
  try {
    const buffer = await file.slice(0, HEADER_BYTE_LENGTH).arrayBuffer()
    return new Uint8Array(buffer)
  } catch {
    return null
  }
}

async function validateSingleFile(file) {
  const headerBytes = await readHeaderBytes(file)
  const result = validateFileMeta({
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    headerBytes,
  })
  if (result.ok) return { ok: true }
  return { ok: false, reason: result.reason, message: REASON_MESSAGES[result.reason] }
}

/**
 * 새로 추가하려는 파일 목록을 검증한다. 확장자·MIME·매직바이트·개별 크기를
 * 먼저 검사하고, 통과한 파일들에 한해 (기존 누적 용량 + 이번 배치) 합산이
 * 50MB를 넘지 않는 선까지만 허용한다.
 *
 * @param {FileList|File[]} fileList
 * @param {number} existingTotalBytes - 이미 선택되어 있는 파일들의 합산 크기
 * @returns {Promise<{ accepted: File[], rejected: { file: File, message: string }[] }>}
 */
export async function validateFiles(fileList, existingTotalBytes = 0) {
  const files = Array.from(fileList)
  const accepted = []
  const rejected = []
  let totalBytes = existingTotalBytes

  for (const file of files) {
    const result = await validateSingleFile(file)
    if (!result.ok) {
      rejected.push({ file, message: result.message })
      continue
    }

    if (totalBytes + file.size > MAX_TOTAL_SIZE_BYTES) {
      rejected.push({ file, message: REASON_MESSAGES['total-size'] })
      continue
    }

    totalBytes += file.size
    accepted.push(file)
  }

  return { accepted, rejected }
}

export { MAX_FILE_SIZE_BYTES, MAX_TOTAL_SIZE_BYTES }
