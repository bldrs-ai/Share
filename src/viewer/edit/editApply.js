import {EditOpKind, validateEditOp} from './editOps'
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
 * @typedef {object} EditRefResolver
 * @property {function(string): ({target: *}|{reason: string})} resolve
 *   A ref → the backend's handle for the element it names, or why it names
 *   nothing. A handle is per-load (an IFC element's expressID and its
 *   instances, a batch id) and never leaves the session.
 *
 * @typedef {object} EditBackend
 *   Every method acts on one element. After `create`, `duplicate` and
 *   `restore` return, the resolver must resolve the ref they were given.
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
 * Resolve every ref, reporting each one that names nothing. Never throws and
 * never drops a ref (rubric item 10).
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
      return op.targets
    case EditOpKind.DUPLICATE:
      return op.payload.copies
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
 * Apply an op, all or nothing.
 *
 * - An invalid op, or one with any target that does not resolve, changes
 *   nothing and says why. A partial edit that looked like success is worse
 *   than a report (the same rule as `viewer/tools/refs.js#assertResolved`).
 * - If the backend throws part way through a multi-target op, the targets
 *   already done are reverted, newest first, and the error is rethrown. The
 *   L0 ops throw on real states (`BatchEditIdError`, `BatchEditReentryError`,
 *   a failed buffer allocation in `batchedGeometryCapacity.js`), and an op
 *   half applied would leave the scene and the log disagreeing.
 *
 * A `create`'s target is not resolved first: it names an element that does
 * not exist yet.
 *
 * @param {object} op
 * @param {object} context
 * @param {EditBackend} context.backend
 * @param {EditRefResolver} context.resolver
 * @return {object} `{ok: true, undo}`, or `{ok: false, reason, unresolved?}`
 *   with `unresolved` listing `{ref, reason}` for each target that named
 *   nothing
 */
export function applyEditOp(op, {backend, resolver}) {
  const invalid = validateEditOp(op)
  if (invalid) {
    return {ok: false, reason: invalid}
  }
  let targets = []
  if (op.kind !== EditOpKind.CREATE) {
    const resolution = resolveEditRefs(op.targets, resolver)
    if (resolution.unresolved.length > 0) {
      return {ok: false, reason: 'unresolved refs; nothing was changed', unresolved: resolution.unresolved}
    }
    targets = resolution.targets
  }
  const undo = captureUndo(op, targets, backend)
  const steps = forwardSteps(op, targets, backend)
  let done = 0
  try {
    for (const step of steps) {
      step()
      done++
    }
  } catch (error) {
    rollBack(op, undo, done, {backend, resolver})
    throw error
  }
  return {ok: true, undo}
}


/**
 * Revert the first `count` targets of a partly applied op.
 *
 * @param {object} op
 * @param {object|null} undo
 * @param {number} count
 * @param {object} context `{backend, resolver}`
 */
function rollBack(op, undo, count, {backend, resolver}) {
  const refs = revertRefs(op).slice(0, count)
  const {targets, unresolved} = resolveEditRefs(refs, resolver)
  if (unresolved.length > 0) {
    // The forward steps that ran made or kept these elements, so this is a
    // backend breaking its contract. Say so instead of half rolling back.
    throw new Error(`editApply: cannot roll back ${op.kind}; unresolved ${JSON.stringify(unresolved)}`)
  }
  const steps = revertSteps(op, undo, targets, backend).slice(0, count)
  for (let i = steps.length - 1; i >= 0; i--) {
    steps[i]()
  }
}


/**
 * @param {string} ref
 * @param {EditRefResolver} resolver
 * @return {*} its target
 * @throws {Error} when it names nothing. Used only for an element a step
 *   that has just returned made or kept, so this is a backend breaking its
 *   contract, and it is said so rather than half rolled back.
 */
function targetAfterStep(ref, resolver) {
  const result = resolver.resolve(ref)
  if (!result || !('target' in result)) {
    throw new Error(`editApply: backend contract broken; ${ref} does not resolve after its step`)
  }
  return result.target
}


/**
 * What re-applies each of a revert's steps, per target, captured before the
 * revert runs: the compensation for a revert that throws part way.
 *
 * - A create's or duplicate's revert deletes what it made, so each is
 *   captured first and comes back by `restore`.
 * - A delete's revert restores, so a restored element is deleted again.
 * - The rest write prior values back, so the current ones are captured, the
 *   same way {@link applyEditOp} captures its undo.
 *
 * @param {object} op
 * @param {Array<*>} targets resolved {@link revertRefs}
 * @param {object} context `{backend, resolver}`
 * @return {Array<Function>} one step per target, in target order
 */
function reapplySteps(op, targets, {backend, resolver}) {
  switch (op.kind) {
    case EditOpKind.CREATE:
    case EditOpKind.DUPLICATE: {
      const snapshots = targets.map((target) => backend.capture(target))
      return revertRefs(op).map((ref, i) => () => backend.restore(ref, snapshots[i]))
    }
    case EditOpKind.DELETE:
      return op.targets.map((ref) => () => backend.delete(targetAfterStep(ref, resolver)))
    default:
      return revertSteps(op, captureUndo(op, targets, backend), targets, backend)
  }
}


/**
 * Revert an applied op: the undo half of a log entry. All or nothing, like
 * {@link applyEditOp}.
 *
 * - Every ref the revert needs is resolved first; if one does not resolve,
 *   nothing is changed and it is reported. That is a state a session can
 *   reach: a view op is not in undo history, so an eviction made after a
 *   document edit can remove the element that edit's undo has to touch (§4).
 * - If the backend throws part way through — a multi-delete's undo restores
 *   one element and then fails to allocate for the next — the steps already
 *   done are re-applied, newest first, and the error is rethrown. Without
 *   that the backend would be half reverted while the log's cursor had not
 *   moved, and a retry would trip over the element already restored.
 *
 * @param {object} op
 * @param {object|null} undo the record {@link applyEditOp} returned
 * @param {object} context `{backend, resolver}`
 * @return {object} `{ok: true}`, or `{ok: false, reason, unresolved}`
 */
export function revertEditOp(op, undo, {backend, resolver}) {
  const {targets, unresolved} = resolveEditRefs(revertRefs(op), resolver)
  if (unresolved.length > 0) {
    return {ok: false, reason: 'unresolved refs; nothing was reverted', unresolved}
  }
  const steps = revertSteps(op, undo, targets, backend)
  const reapply = reapplySteps(op, targets, {backend, resolver})
  // Reverts run newest target first, so the steps done are the top `done`
  // indices; they are re-applied in the opposite order to the one they ran.
  let done = 0
  try {
    for (let i = steps.length - 1; i >= 0; i--) {
      steps[i]()
      done++
    }
  } catch (error) {
    for (let i = steps.length - done; i < steps.length; i++) {
      reapply[i]()
    }
    throw error
  }
  return {ok: true}
}
