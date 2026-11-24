import {EditRefKind, editRefError, globalIdRef, parseEditRef} from './editRefs'
import {mintGlobalId} from './globalId'


/**
 * Edit ops — the pure-data unit of the create-300 op log (L1, #1916;
 * design/new/model-edit.md §4, §5, §6b).
 *
 * An op is
 *
 *   {id, kind, targets, payload, layer}
 *
 * and is plain JSON: no THREE, no per-load id, nothing a reload changes. It
 * is what L3 (#1918) persists and replays, so everything here is checked by
 * {@link validateEditOp} the same way whether the op was just made or came
 * out of someone else's link.
 *
 * - `targets` is an ARRAY of edit refs (editRefs.js) even when it holds one.
 *   A scope is a set of node paths (#1710's scope algebra;
 *   design/new/scope-model.md, pending), and an array lets an op carry that
 *   set later without a schema change. L1 gives the set no meaning beyond
 *   "apply to each, all or nothing".
 * - `layer` is required, `'view'` or `'document'` (§4). The two drive the same
 *   primitives — an eviction and a delete are both a delete — so the layer
 *   cannot be inferred from the kind and is never defaulted.
 * - `payload` is per kind:
 *
 *   | kind          | targets                    | payload                                 |
 *   |---------------|----------------------------|-----------------------------------------|
 *   | `create`      | one `g` ref, minted here   | what to build; opaque to L1 (L2, #1920) |
 *   | `delete`      | the elements               | `{}`                                    |
 *   | `transform`   | the elements               | `{matrix}`: 16 numbers, column-major, a |
 *   |               |                            | delta pre-multiplied onto each placement|
 *   | `duplicate`   | the sources                | `{copies, …}`: one minted `g` ref per   |
 *   |               |                            | target, in order; the rest is opaque    |
 *   | `setProperty` | the elements               | `{key, value}`; `value: null` removes   |
 *   |               |                            | the property (not `undefined`, which    |
 *   |               |                            | JSON drops)                             |
 *   | `setGeometry` | the elements               | `{geometry}`; opaque to L1              |
 *
 * What an op needs to undo itself is captured when it is applied
 * (editApply.js) and kept beside it in the log (editLog.js), not in the op:
 * a delete's prior row holds per-load ids (`parent`, `occurrenceId`, …) that
 * must never be persisted, and a replay re-captures it anyway.
 */


/** Op kinds. */
export const EditOpKind = Object.freeze({
  CREATE: 'create',
  DELETE: 'delete',
  TRANSFORM: 'transform',
  DUPLICATE: 'duplicate',
  SET_PROPERTY: 'setProperty',
  SET_GEOMETRY: 'setGeometry',
})

/** Op layers (model-edit.md §4). */
export const EditLayer = Object.freeze({
  VIEW: 'view',
  DOCUMENT: 'document',
})

const KINDS = new Set(Object.values(EditOpKind))
const LAYERS = new Set(Object.values(EditLayer))
const MATRIX_ELEMENTS = 16


/** Thrown by {@link makeEditOp} for an op it would not make. */
export class EditOpError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'EditOpError'
  }
}


/**
 * @param {*} value
 * @return {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}


/**
 * @param {Array<string>} refs
 * @return {string|null} the reason the list is not a set of g refs, or null
 */
function mintedRefsError(refs) {
  for (const ref of refs) {
    if (parseEditRef(ref)?.kind !== EditRefKind.GLOBAL_ID) {
      return `a created element is named by a g<GlobalId> ref, got ${JSON.stringify(ref)}`
    }
  }
  return null
}


/**
 * Check an op's shape. Ref RESOLUTION is not checked here — that needs a
 * loaded model (editApply.js#resolveEditRefs).
 *
 * @param {*} op
 * @return {string|null} why the op is invalid, or null when it is valid
 */
export function validateEditOp(op) {
  if (!isPlainObject(op)) {
    return 'an op is an object'
  }
  if (typeof op.id !== 'string' || op.id.length === 0) {
    return 'op.id must be a non-empty string'
  }
  if (!KINDS.has(op.kind)) {
    return `unknown op kind ${JSON.stringify(op.kind)}`
  }
  if (!LAYERS.has(op.layer)) {
    return `op.layer must be 'view' or 'document', got ${JSON.stringify(op.layer)}`
  }
  if (!Array.isArray(op.targets) || op.targets.length === 0) {
    return 'op.targets must be a non-empty array of refs'
  }
  for (const ref of op.targets) {
    const refError = editRefError(ref)
    if (refError) {
      return `target ${JSON.stringify(ref)}: ${refError}`
    }
  }
  if (new Set(op.targets).size !== op.targets.length) {
    return 'op.targets repeats a ref'
  }
  if (!isPlainObject(op.payload)) {
    return 'op.payload must be an object'
  }
  return payloadError(op)
}


/**
 * @param {object} op an op whose envelope is valid
 * @return {string|null}
 */
function payloadError(op) {
  const {payload, targets} = op
  switch (op.kind) {
    case EditOpKind.CREATE:
      if (targets.length !== 1) {
        return 'a create op names exactly one target, the element it creates'
      }
      return mintedRefsError(targets)
    case EditOpKind.TRANSFORM: {
      const m = payload.matrix
      return (Array.isArray(m) && m.length === MATRIX_ELEMENTS && m.every(Number.isFinite)) ?
        null : `transform payload.matrix must be ${MATRIX_ELEMENTS} finite numbers`
    }
    case EditOpKind.DUPLICATE: {
      const copies = payload.copies
      if (!Array.isArray(copies) || copies.length !== targets.length) {
        return 'duplicate payload.copies must name one created ref per target'
      }
      const copiesError = mintedRefsError(copies)
      if (copiesError) {
        return copiesError
      }
      const all = new Set([...targets, ...copies])
      return all.size === targets.length + copies.length ? null : 'duplicate copies must be new refs'
    }
    case EditOpKind.SET_PROPERTY:
      if (typeof payload.key !== 'string' || payload.key.length === 0) {
        return 'setProperty payload.key must be a non-empty string'
      }
      // `undefined` is refused because JSON drops it: a persisted op would
      // come back without a value and fail here on replay instead of now.
      return payload.value === undefined ? 'setProperty payload needs a value (null removes the property)' : null
    case EditOpKind.SET_GEOMETRY:
      return isPlainObject(payload.geometry) ? null : 'setGeometry payload.geometry must be an object'
    case EditOpKind.DELETE:
      return null
    default:
      return `unknown op kind ${JSON.stringify(op.kind)}`
  }
}


/**
 * Make an op, minting what it names: its id, a `create`'s target, and a
 * `duplicate`'s copies. Minting here — when the op is made, not when it is
 * applied — is what makes a redo or a replay re-create the same elements
 * under the same refs, so a later op that targets one still resolves
 * (create-engine.md §B3).
 *
 * @param {object} spec
 * @param {string} spec.kind one of {@link EditOpKind}
 * @param {string} spec.layer one of {@link EditLayer}; required
 * @param {Array<string>} [spec.targets] omitted for `create`
 * @param {object} [spec.payload] without `copies` for `duplicate`
 * @param {object} [options]
 * @param {function(number): Uint8Array} [options.randomBytes] see
 *   globalId.js#mintGlobalId; injected by tests
 * @return {object} a valid op
 * @throws {EditOpError} when the spec would make an invalid op
 */
export function makeEditOp({kind, layer, targets, payload = {}}, {randomBytes} = {}) {
  const mint = () => mintGlobalId(randomBytes ? {randomBytes} : undefined)
  let opTargets = targets
  let opPayload = payload
  if (kind === EditOpKind.CREATE) {
    if (targets !== undefined) {
      throw new EditOpError('a create op mints its own target; pass no targets')
    }
    opTargets = [globalIdRef(mint())]
  } else if (kind === EditOpKind.DUPLICATE) {
    if (isPlainObject(payload) && payload.copies !== undefined) {
      throw new EditOpError('a duplicate op mints its own copies; pass no payload.copies')
    }
    opPayload = {...payload, copies: (Array.isArray(targets) ? targets : []).map(() => globalIdRef(mint()))}
  }
  const op = {id: mint(), kind, targets: opTargets, payload: opPayload, layer}
  const invalid = validateEditOp(op)
  if (invalid) {
    throw new EditOpError(invalid)
  }
  return op
}
