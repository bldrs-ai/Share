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
  // Emscripten / WebAssembly heap-exhaustion signatures. On memory-
  // constrained devices (the SHARE-RS population is ~100% old/budget
  // Android) Conway's wasm engine fails to grow its heap mid-parse and
  // surfaces as one of these traps/aborts rather than a tidy "out of
  // memory" string — so without them the failure misses the OOM UX and
  // lands in Sentry as an opaque generic error. Each is independently a
  // genuine memory-exhaustion symptom (no broad tokens like bare
  // "aborted" that could match unrelated fetch/abort errors).
  'aborted(oom)',
  'enlarge memory arrays',
  'memory access out of bounds',
  'out of bounds memory access',
  'table index is out of bounds',
  'memory allocation failed',
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
