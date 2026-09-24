import { validateImagePayload } from './lib/fileValidation.js'
import { guardUsage } from './lib/usage.js'
import { logServerError } from './lib/errorLog.js'
import { maskText } from './lib/masking.js'

// OCR + 개인정보 마스킹을 서버에서 한 번에 처리한다.
// OCR 원문(Vision 결과)은 이 함수의 메모리에서만 다루고, 응답에는 마스킹된 텍스트와 인물 매핑표만 담는다.
// 마스킹에 실패하면 원문을 대신 내려보내지 않고 오류로 응답한다(fail closed).

const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate'

const OCR_FAILURE_MESSAGE = '문서를 읽는 중 오류가 발생했습니다. 다시 시도해주세요.'
const MASKING_FAILURE_MESSAGE =
  '개인정보 자동 마스킹에 실패해 결과를 표시하지 않았습니다. 다시 시도해주세요.'

const VALIDATION_MESSAGES = {
  mime: '지원하지 않는 이미지 형식입니다.',
  size: '파일 크기가 너무 큽니다.',
  signature: '파일 내용을 확인할 수 없습니다.',
  extension: '지원하지 않는 파일 형식입니다.',
  missing: '잘못된 요청입니다.',
  decode: '잘못된 요청입니다.',
}

// DEV_MOCK=true 이거나 NODE_ENV=development 환경에서는 Vision·Claude를 호출하지 않는다.
function isMockMode() {
  return process.env.DEV_MOCK === 'true' || process.env.NODE_ENV === 'development'
}

const MOCK_OCR_TEXT = '홍길동 학생은 010-1234-5678 로 연락함. 김철수 학생과 함께 발표 준비를 함. 홍길동 발표.'

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

// 여러 페이지 PDF에서 페이지마다 별칭이 달라지지 않도록, 앞 페이지까지의 인물 매핑표를 받아 이어서 쓴다.
function sanitizePriorMapping(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry) => entry && typeof entry.alias === 'string' && typeof entry.name === 'string')
    .slice(0, 50)
    .map((entry) => ({ alias: entry.alias.slice(0, 20), name: entry.name.slice(0, 50) }))
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { error: 'Method Not Allowed' })
    }

    let payload
    try {
      payload = JSON.parse(event.body || '{}')
    } catch {
      return jsonResponse(400, { error: '잘못된 요청입니다.' })
    }

    const { imageBase64, mimeType } = payload

    const validation = validateImagePayload({ imageBase64, mimeType })
    if (!validation.ok) {
      return jsonResponse(400, { error: VALIDATION_MESSAGES[validation.reason] || '잘못된 요청입니다.' })
    }

    const blocked = await guardUsage('vision', event)
    if (blocked) return blocked

    const mock = isMockMode()

    let rawText // 원문: 이 함수 안에서만 사용하고 응답·로그·DB에 담지 않는다
    if (mock) {
      console.log('[MOCK MODE] 실제 API 미호출')
      rawText = MOCK_OCR_TEXT
    } else {
      const apiKey = process.env.GOOGLE_CLOUD_API_KEY
      if (!apiKey) {
        await logServerError(event, 'ocr', 'GOOGLE_CLOUD_API_KEY 환경변수가 설정되지 않았습니다.')
        return jsonResponse(500, { error: OCR_FAILURE_MESSAGE })
      }

      let response
      try {
        response = await fetch(`${VISION_API_URL}?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [
              {
                image: { content: imageBase64 },
                features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
              },
            ],
          }),
        })
      } catch (err) {
        await logServerError(event, 'ocr', 'Vision API 호출 실패', err)
        return jsonResponse(502, { error: OCR_FAILURE_MESSAGE })
      }

      if (!response.ok) {
        await logServerError(event, 'ocr', 'Vision API 응답 오류', response.status)
        return jsonResponse(502, { error: OCR_FAILURE_MESSAGE })
      }

      const data = await response.json()
      const result = data.responses?.[0]
      if (result?.error) {
        await logServerError(event, 'ocr', 'Vision API 처리 오류', result.error)
        return jsonResponse(502, { error: OCR_FAILURE_MESSAGE })
      }
      rawText = result?.fullTextAnnotation?.text ?? ''
    }

    // 글자가 없는 페이지는 마스킹할 것이 없다.
    if (!rawText.trim()) {
      return jsonResponse(200, { maskedText: '', mappingTable: [], mappingStatus: 'empty', autoMaskCount: 0 })
    }

    // 마스킹(Claude) 사용량 확인: 한도를 넘으면 원문을 내려보내지 않고 429로 응답한다.
    const maskBlocked = await guardUsage('mask', event)
    if (maskBlocked) return maskBlocked

    const masked = await maskText(rawText, {
      priorMapping: sanitizePriorMapping(payload.priorMapping),
      mock,
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
    if (!masked.ok) {
      // 원인만 기록한다(원문·응답 본문은 기록하지 않음).
      await logServerError(event, 'ocr', `자동 마스킹 실패(${masked.reason})`, masked.error)
      return jsonResponse(502, { error: MASKING_FAILURE_MESSAGE })
    }

    return jsonResponse(200, {
      maskedText: masked.maskedText,
      mappingTable: masked.mappingTable,
      mappingStatus: masked.mappingStatus,
      autoMaskCount: masked.autoMaskCount,
    })
  } catch (err) {
    await logServerError(event, 'ocr', '처리되지 않은 오류', err)
    return jsonResponse(500, { error: OCR_FAILURE_MESSAGE })
  }
}
