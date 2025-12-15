/**
 * @param text - The text to parse.
 * @return JSON string or nothing if not found
 */
export function safeJsonFromCodeBlock(text: string): string | null {
  const match = text.match(/```(?:json)?\s*({[\s\S]*?})\s*```/i)
  if (!match) {
    return null
  }
  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}
