const MASK_FUNCTION_URL = '/.netlify/functions/mask'

const TEXT_MARKER = '[변환된 텍스트]'
const MAPPING_MARKER = '[인물 매핑표]'

function parseMaskingResponse(rawText, originalText) {
  try {
    if (typeof rawText !== 'string') {
      return { maskedText: originalText, mappingTable: [] }
    }
    if (!rawText.includes(TEXT_MARKER)) {
      return { maskedText: rawText, mappingTable: [] }
    }

    const afterMarker = rawText.slice(rawText.indexOf(TEXT_MARKER) + TEXT_MARKER.length)
    const mappingIndex = afterMarker.indexOf(MAPPING_MARKER)

    if (mappingIndex === -1) {
      return { maskedText: afterMarker.trim(), mappingTable: [] }
    }

    const maskedText = afterMarker.slice(0, mappingIndex).trim()
    const mappingTable = afterMarker
      .slice(mappingIndex + MAPPING_MARKER.length)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [alias, ...rest] = line.split(':')
        return { alias: alias.trim(), name: rest.join(':').trim() }
      })
      .filter((entry) => entry.alias && entry.name)

    return { maskedText, mappingTable }
  } catch {
    return { maskedText: originalText, mappingTable: [] }
  }
}

export async function maskPersonalInfo(text) {
  if (!text) return { maskedText: text, mappingTable: [], success: false }

  let response
  try {
    response = await fetch(MASK_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch {
    return { maskedText: text, mappingTable: [], success: false }
  }

  const data = await response.json().catch(() => null)
  if (!response.ok || !data || data.error) {
    return { maskedText: text, mappingTable: [], success: false }
  }

  const { maskedText, mappingTable } = parseMaskingResponse(data.text, text)
  return { maskedText, mappingTable, success: data.success ?? true }
}
