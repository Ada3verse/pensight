import Anthropic from '@anthropic-ai/sdk'
import { parseAliasLines } from '../../../src/utils/aliasLineParser.js'

// 개인정보 자동 마스킹(서버 전용). OCR 원문은 이 모듈 안에서만 다루고 브라우저로 내려보내지 않는다.
// 이름은 가/나/다… 별칭으로, 전화번호·학번·생년월일·주소는 고정 형식으로 치환한다.

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 4096

const TEXT_MARKER = '[변환된 텍스트]'
const MAPPING_MARKER = '[인물 매핑표]'

// 자동 마스킹이 만들어내는 고정 형식(전화번호·학번·생년월일·주소). 마스킹 개수 집계에 쓴다.
const FIXED_MASK_PATTERN = /010-\*{4}-\*{4}|\*{4}년 \*{2}월 \*{2}일|○○시 ○○구 \*{3}|\*{6}/g

function priorMappingBlock(priorMapping) {
  if (priorMapping.length === 0) return ''
  const lines = priorMapping.map((entry) => `${entry.alias}: ${entry.name}`).join('\n')
  return `
- 같은 문서의 앞 페이지에서 이미 정해진 인물 매핑이 있다. 아래 인물이 다시 나오면 반드시 같은 기호를 쓰고, 새로 등장하는 인물은 아직 쓰지 않은 다음 기호부터 순서대로 배정해:
${lines}
- [인물 매핑표]에는 위 기존 인물과 이번에 새로 나온 인물을 모두 출력`
}

export function buildMaskPrompt(text, priorMapping = []) {
  return `다음 텍스트에서 사람 이름을 찾아 가/나/다 순서로 치환해줘.

규칙:
- 텍스트에 등장하는 순서대로 첫 번째 인물=가, 두 번째=나, 세 번째=다, 네 번째=라... 순으로 치환
- 같은 인물이 여러 번 나오면 동일한 기호로 통일
- 이름 외 다른 개인정보(전화번호, 학번, 주소, 생년월일)는 기존처럼 마스킹:
  전화번호 → 010-****-****
  학번/번호 → ******
  생년월일 → ****년 **월 **일
  주소 → ○○시 ○○구 ***
- 결과는 두 부분으로 나눠서 출력:
  [변환된 텍스트]
  실제 변환된 내용
  [인물 매핑표]
  가: 홍길동
  나: 김철수
  다: 이영희
- 이름이 없으면 [인물 매핑표] 없이 변환된 텍스트만 출력
- 위 형식 외에 다른 설명은 절대 추가하지 마${priorMappingBlock(priorMapping)}

다음은 변환할 텍스트입니다:
${text}`
}

// Mock 응답: 실제 프롬프트가 요구하는 출력 형식을 흉내 낸다. 예시 이름(홍길동·김철수·이영희)과 전화번호만 치환한다.
const MOCK_NAMES = ['홍길동', '김철수', '이영희']
const MOCK_ALIASES = ['가', '나', '다']

export function buildMockMaskingResponse(text) {
  let masked = text.replace(/010-\d{4}-\d{4}/g, '010-****-****')
  const mapping = []
  MOCK_NAMES.forEach((name, index) => {
    if (!masked.includes(name)) return
    masked = masked.split(name).join(MOCK_ALIASES[index])
    mapping.push(`${MOCK_ALIASES[index]}: ${name}`)
  })
  const mappingBlock = mapping.length ? `\n${MAPPING_MARKER}\n${mapping.join('\n')}` : ''
  return `${TEXT_MARKER}\n${masked}${mappingBlock}`
}

/**
 * Claude 응답을 { maskedText, mappingTable }로 해석한다.
 * 지시한 형식이 아니면 null — 이때 응답 내용을 신뢰할 수 없으므로 호출한 쪽은 결과를 내려보내지 않는다.
 */
export function parseMaskingResponse(rawText) {
  if (typeof rawText !== 'string' || !rawText.includes(TEXT_MARKER)) return null

  const afterMarker = rawText.slice(rawText.indexOf(TEXT_MARKER) + TEXT_MARKER.length)
  const mappingIndex = afterMarker.indexOf(MAPPING_MARKER)
  if (mappingIndex === -1) return { maskedText: afterMarker.trim(), mappingTable: [] }

  return {
    maskedText: afterMarker.slice(0, mappingIndex).trim(),
    mappingTable: parseAliasLines(afterMarker.slice(mappingIndex + MAPPING_MARKER.length)).map(({ alias, value }) => ({
      alias,
      name: value,
    })),
  }
}

// 앞 페이지에서 정해진 별칭은 그대로 두고, 이번 응답에 새로 나온 인물만 뒤에 붙인다.
function mergeMapping(prior, current) {
  const merged = [...prior]
  for (const entry of current) {
    if (!merged.some((existing) => existing.alias === entry.alias)) merged.push(entry)
  }
  return merged
}

/** 자동 마스킹된 곳의 개수(근사값): 원문에서 매핑표 이름이 나온 횟수 + 결과에서 고정 형식 마스킹이 나온 횟수. */
export function countAutoMasked(originalText, maskedText, mappingTable) {
  const names = new Set(mappingTable.map((entry) => entry.name).filter((name) => name && name !== '-'))
  let count = 0
  for (const name of names) count += originalText.split(name).length - 1
  return count + (maskedText.match(FIXED_MASK_PATTERN) ?? []).length
}

/**
 * 원문 텍스트를 마스킹한다.
 * @returns {Promise<{ ok: true, maskedText, mappingTable, mappingStatus, autoMaskCount } | { ok: false, reason: string, error?: unknown }>}
 *   실패 시에도 원문은 돌려주지 않는다.
 */
export async function maskText(text, { priorMapping = [], mock = false, apiKey } = {}) {
  let rawResponse
  if (mock) {
    rawResponse = buildMockMaskingResponse(text)
  } else {
    if (!apiKey) return { ok: false, reason: 'no_api_key' }
    try {
      const response = await new Anthropic({ apiKey }).messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: buildMaskPrompt(text, priorMapping) }],
      })
      const textBlock = response.content.find((block) => block.type === 'text')
      if (!textBlock) return { ok: false, reason: 'no_text_block' }
      rawResponse = textBlock.text
    } catch (error) {
      return { ok: false, reason: 'api_error', error }
    }
  }

  const parsed = parseMaskingResponse(rawResponse)
  if (!parsed) return { ok: false, reason: 'bad_format' }

  const mappingTable = mergeMapping(priorMapping, parsed.mappingTable)
  return {
    ok: true,
    maskedText: parsed.maskedText,
    mappingTable,
    mappingStatus: mappingTable.length > 0 ? 'success' : 'empty',
    autoMaskCount: countAutoMasked(text, parsed.maskedText, mappingTable),
  }
}
