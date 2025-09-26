// Centralized Out Of Memory (OOM) heuristics.
// NOTE: Keep patterns lowercase. Consumers should lowercase their message before matching.

export const OOM_PATTERNS = [
  'out of memory',
  'wasm memory',
  'memory allocate',
  'cannot enlarge memory',
  'array buffer allocation failed',
  'could not allocate',
  'javascript heap',
  'insufficient memory',
  'allocation failed - process out of memory',
]

/**
 * Heuristically determine whether an error represents an out-of-memory condition.
 *
 * @param {any} err
 * @return {boolean}
 */
export function isOutOfMemoryError(err) {
  if (!err) {
return false
}
  try {
    const msg = (err && (err.message || err.toString() || ''))?.toLowerCase?.() || ''
    return OOM_PATTERNS.some((p) => msg.includes(p))
  } catch (_) {
    return false
  }
}
