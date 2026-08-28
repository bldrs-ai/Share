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
  // Android) Conway's wasm engine can fail to grow its heap mid-parse and
  // surface an explicit OOM abort rather than a tidy "out of memory"
  // string. Only add signatures that UNAMBIGUOUSLY mean memory exhaustion:
  // classifying an error as OOM here both suppresses its Sentry capture
  // (CadView skips capture for handled OOM) and shows the user a "device
  // too constrained" dialog, so a false positive would hide a real bug.
  //
  // Deliberately NOT included: bare wasm memory/table traps like
  // "memory access out of bounds" or "table index is out of bounds".
  // Those are control-flow / wild-pointer traps that a genuine Conway
  // code defect throws just as readily as heap exhaustion does — keeping
  // them out means such defects stay captured (with their real message,
  // now surfaced via readModel) so triage can see them, instead of being
  // silently dropped and mislabeled as OOM. Tighten this list from real
  // Sentry data once the true messages surface.
  'aborted(oom)',
  'memory allocation failed',
]

/**
 * Tag an error as out-of-memory when it matches, guarding against
 * primitive throwables. Emscripten `abort()` (and other engine paths)
 * can throw a bare string/number, and assigning a property to a
 * primitive throws a TypeError in strict mode — so only object errors
 * are tagged. Consumers that classify by message (`isOutOfMemoryError`)
 * still work on primitives; the `.isOutOfMemory` tag is a convenience
 * for object errors that flow through multiple catch layers.
 *
 * @param {any} err
 * @return {any} the same err, tagged in place when applicable
 */
export function markIfOutOfMemory(err) {
  if (err !== null && typeof err === 'object' && isOutOfMemoryError(err)) {
    err.isOutOfMemory = true
  }
  return err
}

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
