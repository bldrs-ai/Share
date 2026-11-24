import {EditOpKind, canonicalEditOp} from './editOps'
import {parseEditRef} from './editRefs'
import {isGlobalId} from './globalId'


/**
 * The op applier and ref resolver (create-300 L1, #1916;
 * design/new/model-edit.md §6b). Pure in the same sense as
 * `viewer/display/overrideStack.js`: no THREE, no store. It turns an op into
 * calls on an {@link EditBackend} and its refs into targets through an
 * {@link EditRefResolver}; L2 (#1917) implements both over
 * `viewer/ifc/batchedEdit.js`, and `editBackend.fixture.js` is the fake the
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
 * @property {function(string): ({target: *}|{reason: string})} resolve
 *   A ref → the backend's handle for the element it names, or why it names
 *   nothing. A handle is per-load (an IFC element's expressID and its
 *   instances, a batch id) and never leaves the session. Naming nothing is a
 *   `{reason}`, not a throw: a throw is a broken resolver, and fail-stops.
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


/**
 * Compose a resolver from one lookup per ref kind. A model has the lookups
 * its format can answer: IFC has `g`, STEP has `o`, a scene graph has `n`.
 * A ref of a kind the model has no lookup for is reported, with that reason,
 * rather than looked up and missed.
 *
 * @param {object} lookups `{g?, o?, n?}`, each `(parsed, ref) =>
 *   {target} | {reason}`
 * @return {EditRefResolver}
 */
export function makeEditRefResolver(lookups) {
  return {
    resolve(ref) {
      const parsed = parseEditRef(ref)
      if (parsed === null) {
        return {reason: 'not an edit ref'}
      }
      const lookup = lookups[parsed.kind]
      if (!lookup) {
        return {reason: `this model has no ${parsed.kind} refs`}
      }
      return lookup(parsed, ref)
    },
  }
}


/**
 * Resolve every ref, reporting each one that names nothing. Never drops a
 * ref (rubric item 10). A resolver that throws is not caught here; inside
 * {@link applyEditOp} and {@link revertEditOp} that throw fail-stops.
 *
 * @param {Array<string>} refs
 * @param {EditRefResolver} resolver
 * @return {{targets: Array<*>, unresolved: Array<{ref: string, reason: string}>}}
 *   `targets` in ref order
 */
export function resolveEditRefs(refs, resolver) {
  const targets = []
  const unresolved = []
  for (const ref of refs) {
    const result = resolver.resolve(ref)
    if (result && 'target' in result) {
      targets.push(result.target)
    } else {
      unresolved.push({ref, reason: result?.reason ?? 'unresolved'})
    }
  }
  return {targets, unresolved}
}


/**
 * The GlobalId → expressID leg of an IFC model's `g` lookup, built from a
 * spatial tree whose nodes carry `GlobalId: {value}`.
 *
 * It is exact and case-sensitive. `search/SearchIndex.js#eltsByGlobalId` is
 * not usable for this: it indexes every key lower-cased as well, and puts
 * description tokens in the same table, so a lookup there can answer for a
 * ref that names no element. A GlobalId two elements share — a real defect
 * of some exporters — is reported rather than resolved to either.
 *
 * On a cache-hit load the tree comes from `BLDRS_spatial_tree`, whose nodes
 * carry no GlobalId (`loader/bldrsSpatialTree.js#serializeNode`), so this
 * index is EMPTY there and every source `g` ref reports unresolved.
 * model-edit.md §5.1 has the finding and the proposed fix.
 *
 * @param {object} rootElement spatial tree root
 * @return {function(string): ({expressID: number}|{reason: string})}
 */
export function ifcGlobalIdIndex(rootElement) {
  const byGlobalId = new Map()
  const stack = rootElement ? [rootElement] : []
  while (stack.length > 0) {
    const node = stack.pop()
    const globalId = node.GlobalId?.value
    if (isGlobalId(globalId) && Number.isInteger(node.expressID)) {
      const ids = byGlobalId.get(globalId) ?? []
      if (!ids.includes(node.expressID)) {
        ids.push(node.expressID)
      }
      byGlobalId.set(globalId, ids)
    }
    for (const child of node.children ?? []) {
      stack.push(child)
    }
  }
  return (globalId) => {
    const ids = byGlobalId.get(globalId)
    if (!ids) {
      return {reason: 'no element with this GlobalId in the loaded model'}
    }
    if (ids.length > 1) {
      return {reason: `GlobalId is not unique in this model (expressIDs ${ids.join(', ')})`}
    }
    return {expressID: ids[0]}
  }
}


/**
 * The refs an op brings into being: a create's target, a duplicate's copies.
 * Each must name nothing when the op is applied (or redone, after an undo
 * deleted them again), or the op would overwrite or collide with a live
 * element.
 *
 * @param {object} op
 * @return {Array<string>}
 */
function outputRefs(op) {
  switch (op.kind) {
    case EditOpKind.CREATE:
      return op.targets
    case EditOpKind.DUPLICATE:
      return op.payload.copies
    default:
      return []
  }
}


/**
 * The output refs that already name a live element. A ref the resolver
 * cannot resolve, for any reason (never minted, deleted), is absent.
 *
 * @param {Array<string>} refs
 * @param {EditRefResolver} resolver
 * @return {Array<{ref: string, reason: string}>}
 */
function liveRefs(refs, resolver) {
  const live = []
  for (const ref of refs) {
    const result = resolver.resolve(ref)
    if (result && 'target' in result) {
      live.push({ref, reason: 'already names a live element'})
    }
  }
  return live
}


/**
 * The refs an op's revert must resolve: for a create or a duplicate, the
 * elements it made; for a delete, none (the backend restores by ref); for
 * the rest, its targets.
 *
 * @param {object} op
 * @return {Array<string>}
 */
function revertRefs(op) {
  switch (op.kind) {
    case EditOpKind.CREATE:
    case EditOpKind.DUPLICATE:
      return outputRefs(op)
    case EditOpKind.DELETE:
      return []
    default:
      return op.targets
  }
}


/**
 * One revert step per target, in target order.
 *
 * @param {object} op
 * @param {object|null} undo
 * @param {Array<*>} targets resolved {@link revertRefs}
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
 * - **Refusals change nothing.** An invalid op, one with any target that
 *   does not resolve, or one whose output ref (a create's target, a
 *   duplicate's copies) already names a live element, returns why, and the
 *   backend is never called. Every ref is resolved before the first backend
 *   call (the undo capture included), so a refusal can never follow a
 *   partial mutation. An output ref that is live is what an untrusted or
 *   hand-built log could carry; an undone create's or duplicate's outputs
 *   are deleted, so they resolve to nothing again and redo proceeds. A partial
 *   edit that looked like success is worse than a report (the same rule as
 *   `viewer/tools/refs.js#assertResolved`).
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
 * @return {object} `{ok: true, undo, op}`, or `{ok: false, reason, unresolved?,
 *   live?}` with `unresolved` listing `{ref, reason}` for each target that
 *   named nothing and `live` each output ref that named something
 * @throws {EditInconsistentError}
 */
export function applyEditOp(given, {backend, resolver}, direction = EditDirection.APPLY) {
  const {op, reason} = canonicalEditOp(given)
  if (reason) {
    return {ok: false, reason}
  }
  return failStop(op, direction, () => {
    // Inputs must resolve and outputs must not, all checked before the
    // first backend call. A create's target is an output, not an input.
    const {targets, unresolved} = resolveEditRefs(op.kind === EditOpKind.CREATE ? [] : op.targets, resolver)
    const live = liveRefs(outputRefs(op), resolver)
    if (unresolved.length > 0) {
      return {ok: false, reason: 'unresolved refs; nothing was changed', unresolved, ...(live.length > 0 && {live})}
    }
    if (live.length > 0) {
      return {ok: false, reason: 'output refs already name live elements; nothing was changed', live}
    }
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
 * - Every ref the revert needs is resolved first; if one does not resolve,
 *   the backend is not called and it is reported. That is a state a session
 *   can reach: a view op is not in undo history, so an eviction made after a
 *   document edit can remove the element that edit's undo has to touch (§4).
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
 * @return {object} `{ok: true}`, or `{ok: false, reason, unresolved}`
 * @throws {EditInconsistentError}
 */
export function revertEditOp(op, undo, {backend, resolver}) {
  return failStop(op, EditDirection.UNDO, () => {
    const {targets, unresolved} = resolveEditRefs(revertRefs(op), resolver)
    if (unresolved.length > 0) {
      return {ok: false, reason: 'unresolved refs; nothing was reverted', unresolved}
    }
    for (const step of revertSteps(op, undo, targets, backend).reverse()) {
      step()
    }
    return {ok: true}
  })
}
