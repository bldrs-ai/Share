import {EditOpKind, canonicalEditOp} from './editOps'
import {parseEditRef} from './editRefs'
import {isGlobalId} from './globalId'


/**
 * The op applier and ref resolver (create-300 L1, #1916;
 * design/new/model-edit.md §6b). Pure in the same sense as
 * `viewer/display/overrideStack.js`: no THREE, no store. It turns an op into
 * calls on an {@link EditBackend} and its refs into targets through an
 * {@link EditRefResolver}; L2 (#1917) implements both over
 * `model/batchedEdit.js`, and `editBackend.fixture.js` is the fake the
 * unit tests drive.
 *
 * **Fail-stop.** A throw from the backend or the resolver is never
 * compensated: it becomes an {@link EditInconsistentError} and the caller
 * (EditSlice) stops editing until the scene is rebuilt from the source and
 * the log replayed. Three review rounds of #2346 each found the next way a
 * compensation could be wrong (no rollback on undo; a rollback step that
 * throws; a step that mutates and then throws), and none can be made safe
 * against a backend that throws, so there is none. model-edit.md §6b,
 * "When the backend throws".
 *
 * @typedef {object} EditRefResolver
 * @property {function(string): object} resolve A ref → one of three answers
 *   (`RefStatus`):
 *   - `{status: 'live', target}`: it names a live element; `target` is the
 *     backend's handle for it, which is per-load (an IFC element's
 *     expressID and its instances, a batch id) and never leaves the session;
 *   - `{status: 'absent', reason}`: it is PROVEN to name nothing live — the
 *     lookup covers every element that ref could name and found none, or
 *     found the element deleted;
 *   - `{status: 'unknown', reason}`: the lookup cannot tell (unavailable,
 *     ambiguous, or not covering the elements), as on a cache-hit load whose
 *     spatial tree carries no GlobalId (§5.1).
 *   Any other answer is read as unknown. Not naming anything is an answer,
 *   not a throw: a throw is a broken resolver, and fail-stops.
 *
 * @typedef {object} EditBackend
 *   Every method acts on one element. After `create`, `duplicate` and
 *   `restore` return, the resolver must resolve the ref they were given.
 *   **A throw from any method means the scene's state is unknown**: the
 *   method may have changed some of it before throwing. L1 does not try to
 *   put anything back (fail-stop, above), so a backend needs no transactions,
 *   only to throw rather than return having done part of its work silently.
 *   One backend object serves one built scene: EditSlice tells a new model
 *   from a lifecycle update by the backend's identity, so a rebuilt scene
 *   must come with a new backend object.
 * @property {function(string, object): void} create `(ref, payload)` build a
 *   new element named by the minted `ref`
 * @property {function(*): void} delete `(target)` remove an element
 * @property {function(*): object} capture `(target)` everything `restore`
 *   needs to bring the element back (matrix, colour, row, geometry…)
 * @property {function(string, object): void} restore `(ref, snapshot)` undo
 *   a delete. Takes the ref, not a target, because a deleted element may no
 *   longer resolve.
 * @property {function(*, string, object): void} duplicate
 *   `(target, copyRef, payload)` copy an element under the minted `copyRef`
 * @property {function(*, Array<number>): void} transform `(target, matrix)`
 *   pre-multiply a delta onto the element's placement
 * @property {function(*): Array<number>} getMatrix `(target)` its placement
 * @property {function(*, Array<number>): void} setMatrix `(target, matrix)`
 *   replace its placement (a transform's undo)
 * @property {function(*, string): *} getProperty `(target, key)`; null when
 *   absent
 * @property {function(*, string, *): void} setProperty `(target, key, value)`;
 *   null removes
 * @property {function(*): object} getGeometry `(target)` its shape, as a
 *   `setGeometry` payload
 * @property {function(*, object): void} setGeometry `(target, geometry)`
 */


/** Which way an op was being run when the backend threw. */
export const EditDirection = Object.freeze({
  APPLY: 'apply',
  UNDO: 'undo',
  REDO: 'redo',
})


/**
 * The backend or the resolver threw while an op ran: the scene may have
 * changed partly, and nothing L1 can see says how. Carries the original
 * error as `cause`, and the op and the direction it was run in for
 * diagnostics. `EditSlice` marks the log inconsistent on one and refuses
 * further ops until `markEditsRecovered` (model-edit.md §6b).
 */
export class EditInconsistentError extends Error {
  /**
   * @param {object} details
   * @param {*} details.cause what the backend or resolver threw
   * @param {object} details.op the canonical op being run
   * @param {string} details.direction an {@link EditDirection}
   */
  constructor({cause, op, direction}) {
    super(`edit backend threw during ${direction} of ${op.kind} op ${op.id} (${cause?.message ?? String(cause)}); ` +
      'the scene state is unknown. Rebuild it from the source and replay the applied ops.')
    this.name = 'EditInconsistentError'
    this.cause = cause
    this.op = op
    this.direction = direction
  }
}


/**
 * Run the part of an op that calls the backend or the resolver, turning any
 * throw into an {@link EditInconsistentError}. Nothing is put back.
 *
 * @param {object} op
 * @param {string} direction
 * @param {Function} run
 * @return {*} what `run` returns
 * @throws {EditInconsistentError}
 */
function failStop(op, direction, run) {
  try {
    return run()
  } catch (cause) {
    throw new EditInconsistentError({cause, op, direction})
  }
}


/** The three answers a resolver gives for a ref (see EditRefResolver). */
export const RefStatus = Object.freeze({
  LIVE: 'live',
  ABSENT: 'absent',
  UNKNOWN: 'unknown',
})


/**
 * Compose a resolver from one lookup per ref kind. A model has the lookups
 * its format can answer: IFC has `g`, STEP has `o`, a scene graph has `n`.
 * A ref of a kind the model has no lookup for is unknown, with that reason,
 * rather than looked up and missed.
 *
 * @param {object} lookups `{g?, o?, n?}`, each `(parsed, ref) =>` a resolver
 *   answer
 * @return {EditRefResolver}
 */
export function makeEditRefResolver(lookups) {
  return {
    resolve(ref) {
      const parsed = parseEditRef(ref)
      if (parsed === null) {
        return {status: RefStatus.UNKNOWN, reason: 'not an edit ref'}
      }
      const lookup = lookups[parsed.kind]
      if (!lookup) {
        return {status: RefStatus.UNKNOWN, reason: `this model has no ${parsed.kind} refs`}
      }
      return lookup(parsed, ref)
    },
  }
}


/**
 * The GlobalId → expressID leg of an IFC model's `g` lookup, built from a
 * spatial tree whose nodes carry `GlobalId: {value}`. Answers with a
 * resolver status, `expressID` in place of `target` when live.
 *
 * - **Exact and case-sensitive.** `search/SearchIndex.js#eltsByGlobalId` is
 *   not usable for this: it indexes every key lower-cased as well, and puts
 *   description tokens in the same table, so a lookup there can answer for
 *   a ref that names no element.
 * - **A GlobalId two elements share** — a real defect of some exporters — is
 *   unknown rather than resolved to either.
 * - **A miss is absent only when the tree covers the model:** every node
 *   carries a GlobalId. On a cache-hit load the tree comes from
 *   `BLDRS_spatial_tree`, whose nodes carry none
 *   (`engine/bldrsSpatialTree.js#serializeNode`), so every lookup there is
 *   unknown: the index cannot see the source elements, and treating its
 *   silence as absence would let a create overwrite one (review of #2346,
 *   round 5). model-edit.md §5.1 has the finding and the proposed fix.
 *   "Covers" means the spatial tree: an element outside it (an opening, a
 *   type) is not seen either; L2's lookup has to close that gap.
 *
 * @param {object} rootElement spatial tree root
 * @return {function(string): object} `{status, expressID?, reason?}`
 */
export function ifcGlobalIdIndex(rootElement) {
  const byGlobalId = new Map()
  let covers = Boolean(rootElement)
  const stack = rootElement ? [rootElement] : []
  while (stack.length > 0) {
    const node = stack.pop()
    const globalId = node.GlobalId?.value
    if (Number.isInteger(node.expressID)) {
      if (isGlobalId(globalId)) {
        const ids = byGlobalId.get(globalId) ?? []
        if (!ids.includes(node.expressID)) {
          ids.push(node.expressID)
        }
        byGlobalId.set(globalId, ids)
      } else {
        covers = false
      }
    }
    for (const child of node.children ?? []) {
      stack.push(child)
    }
  }
  return (globalId) => {
    const ids = byGlobalId.get(globalId)
    if (!ids) {
      return covers ?
        {status: RefStatus.ABSENT, reason: 'no element with this GlobalId in the loaded model'} :
        {status: RefStatus.UNKNOWN, reason: 'this model\'s spatial tree carries no GlobalIds (a cache-hit load?)'}
    }
    if (ids.length > 1) {
      return {status: RefStatus.UNKNOWN, reason: `GlobalId is not unique in this model (expressIDs ${ids.join(', ')})`}
    }
    return {status: RefStatus.LIVE, expressID: ids[0]}
  }
}


/**
 * @param {EditRefResolver} resolver
 * @param {string} ref
 * @return {object} its answer, with anything malformed read as unknown
 */
function refStatus(resolver, ref) {
  const result = resolver.resolve(ref)
  if (result?.status === RefStatus.LIVE && 'target' in result) {
    return result
  }
  if (result?.status === RefStatus.ABSENT) {
    return {status: RefStatus.ABSENT, reason: result.reason}
  }
  return {status: RefStatus.UNKNOWN, reason: result?.reason ?? 'the resolver gave no answer'}
}


/**
 * @param {object} op
 * @return {object} `{live, absent}`: the op's targets, which must be live
 */
const targetsLive = (op) => ({live: op.targets, absent: []})


/**
 * What must hold of an op's refs before it runs, per kind and direction:
 * `{live, absent}`, the refs that must be live and the refs that must be
 * proven absent. One table for apply, undo and redo, so the next edge case
 * is a row, not a branch (review of #2346, rounds 4 and 5).
 *
 * - The `live` refs, resolved in order, are the targets the steps act on.
 * - A ref an op brings into being must be absent: a create's target and a
 *   duplicate's copies going forward, a delete's targets on undo, since
 *   `restore` brings them back. A view-layer op is not in history, so one
 *   may have made an element under that ref in between.
 * - Everything is derived from the op. An undo record adds no refs: a
 *   delete's snapshots are restored under the op's own targets.
 * - Redo is apply again.
 */
const forward = {
  [EditOpKind.CREATE]: (op) => ({live: [], absent: op.targets}),
  [EditOpKind.DELETE]: targetsLive,
  [EditOpKind.TRANSFORM]: targetsLive,
  [EditOpKind.DUPLICATE]: (op) => ({live: op.targets, absent: op.payload.copies}),
  [EditOpKind.SET_PROPERTY]: targetsLive,
  [EditOpKind.SET_GEOMETRY]: targetsLive,
}
const backward = {
  [EditOpKind.CREATE]: (op) => ({live: op.targets, absent: []}),
  [EditOpKind.DELETE]: (op) => ({live: [], absent: op.targets}),
  [EditOpKind.TRANSFORM]: targetsLive,
  [EditOpKind.DUPLICATE]: (op) => ({live: op.payload.copies, absent: []}),
  [EditOpKind.SET_PROPERTY]: targetsLive,
  [EditOpKind.SET_GEOMETRY]: targetsLive,
}
/** `EDIT_PRECONDITIONS[kind][direction](op)` → `{live, absent}`, as above. */
export const EDIT_PRECONDITIONS = Object.freeze(Object.fromEntries(Object.values(EditOpKind).map((kind) =>
  [kind, Object.freeze({
    [EditDirection.APPLY]: forward[kind],
    [EditDirection.UNDO]: backward[kind],
    [EditDirection.REDO]: forward[kind],
  })])))


/**
 * Check an op's preconditions ({@link EDIT_PRECONDITIONS}) before any
 * backend call. Only a `live` answer satisfies a ref that must be live, and
 * only a proven `absent` one satisfies a ref that must be absent: unknown
 * never does, either way. Reports every ref that fails, never just the first
 * (rubric item 10).
 *
 * @param {object} op a canonical op
 * @param {string} direction {@link EditDirection}
 * @param {EditRefResolver} resolver
 * @return {object} `{ok: true, targets}` with the live refs' targets in
 *   order, or `{ok: false, reason, unresolved?, live?, unknown?}`, each list
 *   `{ref, reason}`: `unresolved` for refs that had to be live and are not,
 *   `live` and `unknown` for refs that had to be absent
 */
export function checkPreconditions(op, direction, resolver) {
  const {live: mustBeLive, absent: mustBeAbsent} = EDIT_PRECONDITIONS[op.kind][direction](op)
  const targets = []
  const unresolved = []
  const live = []
  const unknown = []
  for (const ref of mustBeLive) {
    const answer = refStatus(resolver, ref)
    if (answer.status === RefStatus.LIVE) {
      targets.push(answer.target)
    } else {
      unresolved.push({ref, reason: answer.reason})
    }
  }
  for (const ref of mustBeAbsent) {
    const answer = refStatus(resolver, ref)
    if (answer.status === RefStatus.LIVE) {
      live.push({ref, reason: 'already names a live element'})
    } else if (answer.status === RefStatus.UNKNOWN) {
      unknown.push({ref, reason: answer.reason})
    }
  }
  if (unresolved.length + live.length + unknown.length === 0) {
    return {ok: true, targets}
  }
  const nothing = direction === EditDirection.UNDO ? 'nothing was reverted' : 'nothing was changed'
  const why = unresolved.length > 0 ? 'unresolved refs' :
    live.length > 0 ? 'refs that must be absent name live elements' :
      'cannot tell whether refs that must be absent are'
  return {
    ok: false,
    reason: `${why}; ${nothing}`,
    ...(unresolved.length > 0 && {unresolved}),
    ...(live.length > 0 && {live}),
    ...(unknown.length > 0 && {unknown}),
  }
}


/**
 * One revert step per target, in target order.
 *
 * @param {object} op
 * @param {object|null} undo
 * @param {Array<*>} targets the undo preconditions' live refs, resolved
 * @param {EditBackend} backend
 * @return {Array<Function>}
 */
function revertSteps(op, undo, targets, backend) {
  switch (op.kind) {
    case EditOpKind.CREATE:
    case EditOpKind.DUPLICATE:
      return targets.map((target) => () => backend.delete(target))
    case EditOpKind.DELETE:
      return op.targets.map((ref, i) => () => backend.restore(ref, undo.snapshots[i]))
    case EditOpKind.TRANSFORM:
      return targets.map((target, i) => () => backend.setMatrix(target, undo.matrices[i]))
    case EditOpKind.SET_PROPERTY:
      return targets.map((target, i) => () => backend.setProperty(target, op.payload.key, undo.values[i]))
    case EditOpKind.SET_GEOMETRY:
      return targets.map((target, i) => () => backend.setGeometry(target, undo.geometries[i]))
    default:
      throw new TypeError(`editApply: unknown op kind ${op.kind}`)
  }
}


/**
 * Capture what reverts an op, BEFORE any of it runs, so a multi-target op
 * that reads a target another of its own steps changes still records each
 * one's state as it was.
 *
 * @param {object} op
 * @param {Array<*>} targets
 * @param {EditBackend} backend
 * @return {object|null}
 */
function captureUndo(op, targets, backend) {
  switch (op.kind) {
    case EditOpKind.DELETE:
      return {snapshots: targets.map((target) => backend.capture(target))}
    case EditOpKind.TRANSFORM:
      return {matrices: targets.map((target) => backend.getMatrix(target))}
    case EditOpKind.SET_PROPERTY:
      return {values: targets.map((target) => backend.getProperty(target, op.payload.key))}
    case EditOpKind.SET_GEOMETRY:
      return {geometries: targets.map((target) => backend.getGeometry(target))}
    default:
      // create and duplicate are reverted by deleting what they made.
      return null
  }
}


/**
 * @param {object} op
 * @param {Array<*>} targets
 * @param {EditBackend} backend
 * @return {Array<Function>} one forward step per target
 */
function forwardSteps(op, targets, backend) {
  const {payload} = op
  switch (op.kind) {
    case EditOpKind.CREATE:
      return [() => backend.create(op.targets[0], payload)]
    case EditOpKind.DELETE:
      return targets.map((target) => () => backend.delete(target))
    case EditOpKind.TRANSFORM:
      return targets.map((target) => () => backend.transform(target, payload.matrix))
    case EditOpKind.DUPLICATE:
      return targets.map((target, i) => () => backend.duplicate(target, payload.copies[i], payload))
    case EditOpKind.SET_PROPERTY:
      return targets.map((target) => () => backend.setProperty(target, payload.key, payload.value))
    case EditOpKind.SET_GEOMETRY:
      return targets.map((target) => () => backend.setGeometry(target, payload.geometry))
    default:
      throw new TypeError(`editApply: unknown op kind ${op.kind}`)
  }
}


/**
 * Apply an op, or redo one.
 *
 * - **Refusals change nothing.** An invalid op, or one whose refs fail
 *   {@link checkPreconditions} — a target that is not live, an output ref
 *   (a create's target, a duplicate's copies) that is live or cannot be
 *   proven absent — returns why, and the backend is never called. The check
 *   runs before the first backend call (the undo capture included), so a
 *   refusal can never follow a partial mutation. An undone create's or
 *   duplicate's outputs are deleted, so they are absent again and redo
 *   proceeds. A partial edit that looked like success is worse than a report
 *   (the same rule as `viewer/tools/refs.js#assertResolved`).
 * - **A throw fail-stops.** If the backend or the resolver throws, nothing is
 *   put back: an {@link EditInconsistentError} is thrown with the original
 *   error as its `cause`. The L0 ops throw on real states
 *   (`BatchEditIdError`, `BatchEditReentryError`, a failed buffer allocation
 *   in `batchedGeometryCapacity.js`), and may have changed some of the scene
 *   when they do.
 *
 * The op is canonicalized first (editOps.js#canonicalEditOp), and it is that
 * deep-frozen copy which is applied and returned as `op`, for the caller to
 * record: what was checked, applied and persisted is one object.
 *
 * @param {object} given the op, canonical or not
 * @param {object} context
 * @param {EditBackend} context.backend
 * @param {EditRefResolver} context.resolver
 * @param {string} [direction] {@link EditDirection} APPLY or REDO, for the
 *   error's diagnostics
 * @return {object} `{ok: true, undo, op}`, or {@link checkPreconditions}'s
 *   refusal
 * @throws {EditInconsistentError}
 */
export function applyEditOp(given, {backend, resolver}, direction = EditDirection.APPLY) {
  const {op, reason} = canonicalEditOp(given)
  if (reason) {
    return {ok: false, reason}
  }
  return failStop(op, direction, () => {
    const checked = checkPreconditions(op, direction, resolver)
    if (!checked.ok) {
      return checked
    }
    const {targets} = checked
    const undo = captureUndo(op, targets, backend)
    for (const step of forwardSteps(op, targets, backend)) {
      step()
    }
    return {ok: true, undo, op}
  })
}


/**
 * Revert an applied op: the undo half of a log entry. The same two rules as
 * {@link applyEditOp}.
 *
 * - Its preconditions are checked first ({@link EDIT_PRECONDITIONS}, the
 *   undo direction); if one fails, the backend is not called and it is
 *   reported. Sessions reach these states: a view op is not in undo
 *   history, so an eviction made after a document edit can remove the
 *   element that edit's undo has to touch, and a view-layer create can take
 *   the ref a delete's undo would restore (§4).
 * - If the backend throws — a multi-delete's undo restores one element and
 *   then fails to allocate for the next — nothing is re-applied: an
 *   {@link EditInconsistentError} is thrown.
 *
 * Targets are reverted newest first, the mirror of the order they were
 * applied in.
 *
 * @param {object} op
 * @param {object|null} undo the record {@link applyEditOp} returned
 * @param {object} context `{backend, resolver}`
 * @return {object} `{ok: true}`, or {@link checkPreconditions}'s refusal
 * @throws {EditInconsistentError}
 */
export function revertEditOp(op, undo, {backend, resolver}) {
  return failStop(op, EditDirection.UNDO, () => {
    const checked = checkPreconditions(op, EditDirection.UNDO, resolver)
    if (!checked.ok) {
      return checked
    }
    for (const step of revertSteps(op, undo, checked.targets, backend).reverse()) {
      step()
    }
    return {ok: true}
  })
}
