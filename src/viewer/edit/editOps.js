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
 *   | `create`      | one `g` ref, minted here   | what to build: OPAQUE to L1 (L2, #1920) |
 *   | `delete`      | the elements               | `{}`                                    |
 *   | `transform`   | the elements               | `{matrix}`: 16 numbers, column-major, a |
 *   |               |                            | delta pre-multiplied onto each placement|
 *   | `duplicate`   | the sources                | `{copies, matrix?}`: one minted `g` ref |
 *   |               |                            | per target, in order; `matrix` places   |
 *   |               |                            | each copy, as a transform would         |
 *   | `setProperty` | the elements               | `{key, value}`: `value` a string,       |
 *   |               |                            | number, boolean, or `null` to remove    |
 *   |               |                            | (not `undefined`, which JSON drops)     |
 *   | `setGeometry` | the elements               | `{geometry}`: `geometry` OPAQUE to L1   |
 *
 * Every schema is EXACT: an envelope or payload key not listed is refused.
 * The two opaque values are instead scanned for the per-load vocabulary
 * (`PER_LOAD_KEYS` below). Either way, an id that names an element only for
 * one load — a batch id, an expressID, L0's minted occurrence and geometry
 * ids — cannot reach the persisted log (model-edit.md §5).
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

const ENVELOPE_KEYS = Object.freeze(['id', 'kind', 'targets', 'payload', 'layer'])

/** The keys each kind's payload may have; `create` is opaque (null). */
const PAYLOAD_KEYS = Object.freeze({
  [EditOpKind.CREATE]: null,
  [EditOpKind.DELETE]: [],
  [EditOpKind.TRANSFORM]: ['matrix'],
  [EditOpKind.DUPLICATE]: ['copies', 'matrix'],
  [EditOpKind.SET_PROPERTY]: ['key', 'value'],
  [EditOpKind.SET_GEOMETRY]: ['geometry'],
})

/**
 * Key names that hold per-load ids, refused anywhere inside an opaque value
 * (a `create` payload, a `setGeometry` geometry). Compared case-insensitively
 * with a trailing plural `s` dropped, so `expressID`, `expressId` and
 * `expressIDs` are all one entry.
 *
 * Why a deny-list there rather than an exact schema: those values are what a
 * generator builds from — an extrusion's profile, depth and psets, or
 * OpenSCAD's code and params (model-edit.md §8; create-engine.md) — and L1
 * cannot enumerate them before L2 and create-320 fix their shapes. When they
 * do, each gets an exact schema like the other kinds and this list goes.
 * Until then it catches the ids the code base actually has: three's batch
 * and instance ids, IFC express ids, and the row columns `batchedEdit.js`
 * mints (`occurrenceId`, `geometryId`, `sourceGeometryId`, and the NAUO
 * `occurrencePath`). `parent` is left out: it is that row's expressID column,
 * but also an ordinary word a generator payload may use for a ref.
 */
export const PER_LOAD_KEYS = Object.freeze([
  'batchId', 'instanceId', 'expressId', 'modelId',
  'occurrenceId', 'occurrencePath', 'geometryId', 'sourceGeometryId',
])

const PER_LOAD_KEY_SET = new Set(PER_LOAD_KEYS.map((key) => key.toLowerCase()))


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
 * @param {object} object
 * @param {Array<string>} allowed
 * @param {string} what for the message
 * @return {string|null} the first key `object` has that `allowed` does not
 */
function unknownKeyError(object, allowed, what) {
  const extra = Object.keys(object).find((key) => !allowed.includes(key))
  return extra === undefined ? null : `${what} has unknown key ${JSON.stringify(extra)}`
}


/**
 * Find a per-load key anywhere in an opaque value. Iterative, because an
 * untrusted log's JSON can nest deeper than the stack.
 *
 * @param {*} value
 * @param {string} path where `value` sits, for the message
 * @return {string|null}
 */
function perLoadKeyError(value, path) {
  const stack = [[value, path]]
  while (stack.length > 0) {
    const [node, at] = stack.pop()
    if (node === null || typeof node !== 'object') {
      continue
    }
    for (const [key, child] of Object.entries(node)) {
      const normal = key.toLowerCase().replace(/s$/, '')
      if (PER_LOAD_KEY_SET.has(normal)) {
        return `per-load id ${JSON.stringify(key)} at ${at}.${key}: name elements by ref, never by a per-load id`
      }
      stack.push([child, `${at}.${key}`])
    }
  }
  return null
}


/**
 * @param {*} m
 * @return {boolean}
 */
function isMatrix(m) {
  return Array.isArray(m) && m.length === MATRIX_ELEMENTS && m.every(Number.isFinite)
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
  const envelopeError = unknownKeyError(op, ENVELOPE_KEYS, 'op')
  if (envelopeError) {
    return envelopeError
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
  const allowed = PAYLOAD_KEYS[op.kind]
  const keysError = allowed === null ?
    perLoadKeyError(op.payload, 'payload') :
    unknownKeyError(op.payload, allowed, `${op.kind} payload`)
  return keysError ?? payloadError(op)
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
    case EditOpKind.TRANSFORM:
      return isMatrix(payload.matrix) ? null : `transform payload.matrix must be ${MATRIX_ELEMENTS} finite numbers`
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
      if (all.size !== targets.length + copies.length) {
        return 'duplicate copies must be new refs'
      }
      return (payload.matrix === undefined || isMatrix(payload.matrix)) ?
        null : `duplicate payload.matrix must be ${MATRIX_ELEMENTS} finite numbers`
    }
    case EditOpKind.SET_PROPERTY:
      if (typeof payload.key !== 'string' || payload.key.length === 0) {
        return 'setProperty payload.key must be a non-empty string'
      }
      // `undefined` is refused because JSON drops it: a persisted op would
      // come back without a value and fail here on replay instead of now.
      if (payload.value === undefined) {
        return 'setProperty payload needs a value (null removes the property)'
      }
      // Scalars only: an IFC single value is one, and a structured value
      // would be an opaque object to scan. One that needs a structure
      // (an enumeration, a list) gets a schema when it is added.
      // A non-finite number is refused for the same reason: JSON writes it
      // as null, so a NaN would come back as a removal.
      return (payload.value === null || ['string', 'boolean'].includes(typeof payload.value) ||
        Number.isFinite(payload.value)) ?
        null : 'setProperty payload.value must be a string, number, boolean or null'
    case EditOpKind.SET_GEOMETRY:
      if (!isPlainObject(payload.geometry)) {
        return 'setGeometry payload.geometry must be an object'
      }
      return perLoadKeyError(payload.geometry, 'payload.geometry')
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
