import { validateImagePayload } from './lib/fileValidation.js'

const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate'

const OCR_FAILURE_MESSAGE = '문서를 읽는 중 오류가 발생했습니다. 다시 시도해주세요.'

const VALIDATION_MESSAGES = {
  mime: '지원하지 않는 이미지 형식입니다.',
  size: '파일 크기가 너무 큽니다.',
  signature: '파일 내용을 확인할 수 없습니다.',
  extension: '지원하지 않는 파일 형식입니다.',
  missing: '잘못된 요청입니다.',
  decode: '잘못된 요청입니다.',
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
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

    const apiKey = process.env.GOOGLE_CLOUD_API_KEY
    if (!apiKey) {
      console.error('[ocr] GOOGLE_CLOUD_API_KEY 환경변수가 설정되지 않았습니다.')
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
      console.error('[ocr] Vision API 호출 실패', err)
      return jsonResponse(502, { error: OCR_FAILURE_MESSAGE })
    }

    if (!response.ok) {
      console.error('[ocr] Vision API 응답 오류', response.status)
      return jsonResponse(502, { error: OCR_FAILURE_MESSAGE })
    }

    const data = await response.json()
    const result = data.responses?.[0]
    if (result?.error) {
      console.error('[ocr] Vision API 처리 오류', result.error)
      return jsonResponse(502, { error: OCR_FAILURE_MESSAGE })
    }

    return jsonResponse(200, { text: result?.fullTextAnnotation?.text ?? '' })
  } catch (err) {
    console.error('[ocr] 처리되지 않은 오류', err)
    return jsonResponse(500, { error: OCR_FAILURE_MESSAGE })
  }
}
