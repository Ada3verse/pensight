import { parseAliasLines } from './aliasLineParser.js'

const MASK_FUNCTION_URL = '/.netlify/functions/mask'

const TEXT_MARKER = '[변환된 텍스트]'
const MAPPING_MARKER = '[인물 매핑표]'

// 개발 환경에서 API 호출 없이 "형식이 깨진 응답" 케이스를 테스트하기 위한 트리거.
// 추출된 텍스트(OCR 결과)에 이 문자열을 포함시키고 마스킹을 (재)실행하면
// Claude가 지시한 형식을 완전히 무시한 응답을 받은 상황을 그대로 재현한다.
// import.meta.env.DEV는 프로덕션 빌드에서 정적으로 false가 되어 코드 자체가
// 번들에서 제거되므로 실서비스에서는 절대 발동하지 않는다.
const DEV_MOCK_TRIGGER = '[MOCK_MAPPING_ERROR]'

function parseMappingLines(sectionText) {
  return parseAliasLines(sectionText).map(({ alias, value }) => ({ alias, name: value }))
}

// mappingStatus:
//  'success' - 유효한 매핑 항목이 1개 이상 있음
//  'empty'   - 응답은 정상적으로 받았으나 매핑할 인물 정보가 없음(정상 케이스 포함)
//  'error'   - 응답 형식이 예상과 달라 신뢰할 수 없음 (재시도 필요)
function parseMaskingResponse(rawText, originalText) {
  try {
    if (typeof rawText !== 'string' || !rawText.trim()) {
      return { maskedText: originalText, mappingTable: [], mappingStatus: 'empty' }
    }

    if (!rawText.includes(TEXT_MARKER)) {
      return { maskedText: rawText, mappingTable: [], mappingStatus: 'error' }
    }

    const afterMarker = rawText.slice(rawText.indexOf(TEXT_MARKER) + TEXT_MARKER.length)
    const mappingIndex = afterMarker.indexOf(MAPPING_MARKER)

    if (mappingIndex === -1) {
      // 인물 매핑표 마커가 없는 것은 "이름이 없으면 생략"하도록 지시한
      // 프롬프트상 정상 케이스이므로 오류가 아니라 빈 결과로 취급한다.
      return { maskedText: afterMarker.trim(), mappingTable: [], mappingStatus: 'empty' }
    }

    const maskedText = afterMarker.slice(0, mappingIndex).trim()
    const mappingTable = parseMappingLines(afterMarker.slice(mappingIndex + MAPPING_MARKER.length))

    return {
      maskedText,
      mappingTable,
      mappingStatus: mappingTable.length > 0 ? 'success' : 'empty',
    }
  } catch (err) {
    console.error('[masking] 매핑표 파싱 중 오류', err)
    return { maskedText: originalText, mappingTable: [], mappingStatus: 'error' }
  }
}

function buildDevMockResponse() {
  // 지시한 마커를 전혀 포함하지 않은 임의의 텍스트만 반환하는 상황을 재현한다.
  return {
    success: true,
    text: 'Claude가 요청한 형식을 따르지 않고 임의의 텍스트만 반환한 상황을 재현한 Mock 응답입니다.',
  }
}

export async function maskPersonalInfo(text) {
  if (!text) return { maskedText: text, mappingTable: [], mappingStatus: 'empty', success: false }

  if (import.meta.env.DEV && text.includes(DEV_MOCK_TRIGGER)) {
    const mockData = buildDevMockResponse()
    const parsed = parseMaskingResponse(mockData.text, text)
    return { ...parsed, success: mockData.success }
  }

  let response
  try {
    response = await fetch(MASK_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch (err) {
    console.error('[masking] 요청 실패', err)
    return { maskedText: text, mappingTable: [], mappingStatus: 'empty', success: false }
  }

  const data = await response.json().catch(() => null)
  if (!response.ok || !data || data.error) {
    return { maskedText: text, mappingTable: [], mappingStatus: 'empty', success: false }
  }

  const parsed = parseMaskingResponse(data.text, text)
  return { ...parsed, success: data.success ?? true }
}
