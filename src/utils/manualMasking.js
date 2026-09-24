// 2단계 마스킹(교사 수동 보완)용 순수 함수 모음.

export const MASK_TOKEN = '■■■'

// 마스킹된 것으로 보이는 구간: 교사가 가린 ■ 블록 + 자동 마스킹(netlify/functions/lib/masking.js 프롬프트)이
// 만들어내는 고정 형식(전화번호·학번·생년월일·주소).
const MASKED_PATTERN_SOURCE = '■+|010-\\*{4}-\\*{4}|\\*{4}년 \\*{2}월 \\*{2}일|○○시 ○○구 \\*{3}|\\*{6}'

/**
 * 텍스트를 마스킹된 구간과 일반 구간으로 나눈다. 각 조각은 원문에서의 시작 위치를 갖는다.
 * @returns {Array<{ text: string, start: number, masked: boolean }>}
 */
export function splitMaskSegments(text) {
  const pattern = new RegExp(MASKED_PATTERN_SOURCE, 'g')
  const segments = []
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index > cursor) {
      segments.push({ text: text.slice(cursor, match.index), start: cursor, masked: false })
    }
    segments.push({ text: match[0], start: match.index, masked: true })
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), start: cursor, masked: false })
  }
  return segments
}

/**
 * [start, end) 구간을 MASK_TOKEN으로 치환한다. 선택 영역 양끝의 공백·줄바꿈은 그대로 둔다.
 * 실제로 가릴 글자가 없으면 null.
 */
export function applyMask(text, start, end) {
  let from = Math.max(0, Math.min(start, end))
  let to = Math.min(text.length, Math.max(start, end))
  while (from < to && /\s/.test(text[from])) from += 1
  while (to > from && /\s/.test(text[to - 1])) to -= 1
  if (from >= to) return null
  return text.slice(0, from) + MASK_TOKEN + text.slice(to)
}
