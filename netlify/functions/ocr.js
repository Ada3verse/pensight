const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate'

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' })
  }

  let payload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return jsonResponse(400, { error: '잘못된 요청입니다.' })
  }

  const { imageBase64 } = payload
  if (!imageBase64) {
    return jsonResponse(400, { error: 'imageBase64가 필요합니다.' })
  }

  const apiKey = process.env.VITE_VISION_API_KEY
  if (!apiKey) {
    return jsonResponse(500, { error: 'OCR API 키가 설정되지 않았습니다.' })
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
  } catch {
    return jsonResponse(502, { error: 'Vision API 호출에 실패했습니다.' })
  }

  if (!response.ok) {
    return jsonResponse(502, { error: 'Vision API 호출에 실패했습니다.' })
  }

  const data = await response.json()
  const result = data.responses?.[0]
  if (result?.error) {
    return jsonResponse(502, { error: 'Vision API 처리 중 오류가 발생했습니다.' })
  }

  return jsonResponse(200, { text: result?.fullTextAnnotation?.text ?? '' })
}
