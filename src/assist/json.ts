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
  return visit(value, '#', new Set())
}


/**
 * @param value
 * @param path
 * @param ancestors objects on the current path, for cycle detection
 * @return see {@link findNonJson}
 */
function visit(value: unknown, path: string, ancestors: Set<object>): string | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return null
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? null : `${path}: non-finite number ${value}`
  }
  if (typeof value !== 'object') {
    // undefined, function, symbol, bigint
    return `${path}: ${typeof value}`
  }
  if (ancestors.has(value)) {
    return `${path}: cycle`
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return `${path}: ${value.constructor?.name ?? 'binary buffer'}`
  }
  const isArray = Array.isArray(value)
  if (!isArray) {
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) {
      return `${path}: ${proto?.constructor?.name ?? 'class'} instance`
    }
  }
  ancestors.add(value)
  try {
    if (isArray) {
      for (let i = 0; i < value.length; i++) {
        const problem = visit(value[i], `${path}/${i}`, ancestors)
        if (problem) {
          return problem
        }
      }
      return null
    }
    for (const [key, child] of Object.entries(value)) {
      // An absent optional field, which JSON.stringify drops anyway.
      if (child === undefined) {
        continue
      }
      const problem = visit(child, `${path}/${key}`, ancestors)
      if (problem) {
        return problem
      }
    }
    return null
  } finally {
    ancestors.delete(value)
  }
}
