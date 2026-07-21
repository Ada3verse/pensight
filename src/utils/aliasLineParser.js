// "가: 홍길동" 처럼 "별칭: 값" 형태로 줄바꿈 구분된 텍스트를 파싱하는 공용 유틸.
// 인물 매핑표, 역할 분류, 인물별 키워드 등 여러 곳에서 동일한 형식을 쓰므로
// 콜론이 없거나 값이 비어 있는 줄도 버리지 않고 누락된 쪽을 '-'로 채워
// 나머지 줄은 정상적으로 표시되게 한다.
export function parseAliasLines(text) {
  if (typeof text !== 'string') return []
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const colonIndex = line.indexOf(':')
      if (colonIndex === -1) {
        return { alias: line, value: '-' }
      }
      const alias = line.slice(0, colonIndex).trim() || '-'
      const value = line.slice(colonIndex + 1).trim() || '-'
      return { alias, value }
    })
}
