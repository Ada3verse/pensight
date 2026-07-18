const MASK_FUNCTION_URL = '/.netlify/functions/mask'

export async function maskPersonalInfo(text) {
  if (!text) return { text, success: false }

  let response
  try {
    response = await fetch(MASK_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch {
    return { text, success: false }
  }

  const data = await response.json().catch(() => null)
  if (!response.ok || !data || data.error) {
    return { text, success: false }
  }

  return { text: data.text, success: data.success ?? true }
}
