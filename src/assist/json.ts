/**
 * The "JSON-out" half of the tool contract, checked rather than trusted.
 *
 * ai-workspace.md §9: "No geometry buffers ever." A result reaches a model's
 * context window and, for the hosted tier, leaves the device, so a tool that
 * regressed into returning a `BufferAttribute`, a `Float32Array` or a live
 * Object3D would leak geometry and blow the context in one call. The registry
 * runs every result through {@link findNonJson} and refuses one that isn't
 * plain JSON: typed arrays, ArrayBuffers, class instances (Vector3, Mesh,
 * BufferAttribute…), functions, non-finite numbers and cycles all fail, so
 * the failure is loud at the seam rather than silent in a transcript.
 */


/**
 * @param value a tool result's `content`
 * @return null when `value` is plain JSON; otherwise the path to the first
 *   offending value and why, e.g. `#/items/0/position: Float32Array`
 */
export function findNonJson(value: unknown): string | null {
  return copyJson(value).problem
}


/**
 * Validate `value` as plain JSON and copy it, in ONE pass that reads each
 * property exactly once. The copy is what a caller gets, so the guarantee
 * holds after the check too: a provider that keeps a reference and mutates
 * it later, or an accessor that answers differently on a second read, can't
 * reach the caller through it (Codex review on #1946). Validating the
 * original and then copying it would read every getter twice.
 *
 * @param value
 * @return `{copy, problem}`: the fresh plain-JSON copy and null, or
 *   undefined and the path to the first offending value
 */
export function copyJson(value: unknown): {copy: unknown, problem: string | null} {
  try {
    return {copy: visit(value, '#', new Set()), problem: null}
  } catch (e) {
    if (e instanceof NotJson) {
      return {copy: undefined, problem: e.message}
    }
    throw e
  }
}


/** A value that isn't plain JSON, at a path. Internal to the walk. */
class NotJson extends Error {}


/**
 * @param value
 * @param path
 * @param ancestors objects on the current path, for cycle detection
 * @return a plain-JSON copy of `value`
 * @throws {NotJson} at the first value that isn't plain JSON
 */
function visit(value: unknown, path: string, ancestors: Set<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new NotJson(`${path}: non-finite number ${value}`)
    }
    return value
  }
  if (typeof value !== 'object') {
    // undefined, function, symbol, bigint
    throw new NotJson(`${path}: ${typeof value}`)
  }
  if (ancestors.has(value)) {
    throw new NotJson(`${path}: cycle`)
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    throw new NotJson(`${path}: ${value.constructor?.name ?? 'binary buffer'}`)
  }
  const isArray = Array.isArray(value)
  if (!isArray) {
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) {
      throw new NotJson(`${path}: ${proto?.constructor?.name ?? 'class'} instance`)
    }
  }
  ancestors.add(value)
  try {
    if (isArray) {
      const items = value as unknown[]
      const copy = []
      for (let i = 0; i < items.length; i++) {
        copy.push(visit(items[i], `${path}/${i}`, ancestors))
      }
      return copy
    }
    const copy: Record<string, unknown> = {}
    // Object.entries reads each own enumerable property (getters included)
    // once; the copy keeps the value that was checked.
    for (const [key, child] of Object.entries(value)) {
      // An absent optional field, which JSON.stringify drops anyway.
      if (child === undefined) {
        continue
      }
      // Defined, not assigned: `copy['__proto__'] = …` would call the
      // prototype setter, so a JSON `"__proto__"` key would vanish from the
      // copy (and from the size cap) and reparent it instead (Codex review
      // round 3 on #1946). A plain object rather than Object.create(null),
      // so a result still has Object.prototype's methods.
      Object.defineProperty(copy, key, {
        value: visit(child, `${path}/${key}`, ancestors),
        enumerable: true,
        writable: true,
        configurable: true,
      })
    }
    return copy
  } finally {
    ancestors.delete(value)
  }
}
