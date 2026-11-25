import {RefStatus, ifcGlobalIdIndex, makeEditRefResolver} from './editApply'
import {formatEditRef, globalIdRef} from './editRefs'


/**
 * A fake `EditBackend` + resolver (editApply.js) for the L1 unit tests.
 *
 * It models just enough of a loaded IFC model to make "apply then undo is
 * the identity" a claim about real state: source elements reached the way
 * L2 will reach them (GlobalId → expressID through
 * `editApply.js#ifcGlobalIdIndex` over a spatial tree), elements the log
 * creates kept in a registry of their own, and per element a matrix,
 * properties, a geometry and — the per-load part a delete's snapshot holds —
 * a row with a batch id that is NEVER reused, so a restore that resurrected
 * the old row instead of making a new one would show in `state()`.
 *
 * Targets handed to the backend are the element records' keys: an expressID
 * for a source element, the minted ref for a created one.
 */


const MATRIX_ELEMENTS = 16
const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])


/**
 * Column-major 4×4 product `a · b`.
 *
 * @param {Array<number>} a
 * @param {Array<number>} b
 * @return {Array<number>}
 */
export function multiplyMatrices(a, b) {
  const out = new Array(MATRIX_ELEMENTS).fill(0)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) {
        sum += a[(k * 4) + row] * b[(col * 4) + k]
      }
      out[(col * 4) + row] = sum
    }
  }
  return out
}


/**
 * @param {Array<number>} offset `[x, y, z]`
 * @return {Array<number>} a translation matrix
 */
export function translation([x, y, z]) {
  const m = [...IDENTITY]
  m[12] = x
  m[13] = y
  m[14] = z
  return m
}


/**
 * @param {object} [options]
 * @param {Array<object>} [options.elements] source elements `{expressID,
 *   globalId, props?, matrix?}`
 * @param {object} [options.namePaths] `{[nRef]: expressID}`, for `n` refs
 * @param {object} [options.occurrences] `{[oRef]: expressID}`, for `o` refs
 * @param {boolean} [options.cacheHit] index a spatial tree without GlobalIds,
 *   as `BLDRS_spatial_tree` is on a cache-hit load (model-edit.md §5.1): the
 *   source's `g` lookups are then unknown, neither live nor absent
 * @return {object} `{backend, resolver, state, calls}`
 */
export function makeFakeEditModel({elements = [], namePaths = {}, occurrences = {}, cacheHit = false} = {}) {
  const live = new Map()
  let nextBatchId = 0
  const calls = []

  const place = (key, {matrix = IDENTITY, props = {}, geometry = {shape: 'source'}, ref}) => {
    live.set(key, {ref, matrix: [...matrix], props: {...props}, geometry, row: {batchId: nextBatchId++}})
  }
  for (const {expressID, globalId, props, matrix} of elements) {
    place(expressID, {ref: globalIdRef(globalId), props, matrix})
  }

  // No root expressID: the fake has no project element, and every node the
  // index counts carries a GlobalId unless this is a cache hit.
  const tree = {children: elements.map(({expressID, globalId}) =>
    ({expressID, ...(!cacheHit && {GlobalId: {value: globalId}}), children: []}))}
  const sourceByGlobalId = ifcGlobalIdIndex(tree)
  // Every ref the log has minted, live or deleted: like a source GlobalId,
  // a created ref keeps naming its element while it is deleted, so a
  // restore can find it.
  const created = new Set()

  // A ref → its element's key, live or not (as `status: 'live'`): restore
  // needs the key a ref named before the delete, and the resolver adds
  // liveness on top. The name-path and occurrence tables are complete, so a
  // miss there is proven absent.
  const known = (target) => ({status: RefStatus.LIVE, target})
  const keyFor = makeEditRefResolver({
    g: ({globalId}, ref) => {
      if (created.has(ref)) {
        return known(ref)
      }
      const found = sourceByGlobalId(globalId)
      return found.status === RefStatus.LIVE ? known(found.expressID) : found
    },
    n: (parsed) => {
      const id = namePaths[formatEditRef(parsed)]
      return id === undefined ? {status: RefStatus.ABSENT, reason: 'no node at this name path'} : known(id)
    },
    o: (parsed) => {
      const id = occurrences[formatEditRef(parsed)]
      return id === undefined ? {status: RefStatus.ABSENT, reason: 'no occurrence at this path'} : known(id)
    },
  })
  const resolver = {
    resolve(ref) {
      const found = keyFor.resolve(ref)
      if (found.status !== RefStatus.LIVE) {
        return found
      }
      return live.has(found.target) ? found : {status: RefStatus.ABSENT, reason: 'element is deleted'}
    },
  }

  const get = (target) => {
    const element = live.get(target)
    if (!element) {
      throw new Error(`fake backend: ${target} is not live`)
    }
    return element
  }

  const backend = {
    create(ref, payload) {
      calls.push(['create', ref])
      created.add(ref)
      place(ref, {ref, props: payload.props, matrix: payload.matrix, geometry: payload.geometry})
    },
    delete(target) {
      calls.push(['delete', target])
      get(target)
      live.delete(target)
    },
    capture(target) {
      return structuredClone(get(target))
    },
    restore(ref, snapshot) {
      calls.push(['restore', ref])
      const key = keyFor.resolve(ref).target
      // A new row, as L2's `addBatchedInstance` would give: the snapshot's
      // batch id is a per-load id the restore must not resurrect.
      place(key, snapshot)
    },
    duplicate(target, copyRef, {matrix}) {
      calls.push(['duplicate', target, copyRef])
      const source = get(target)
      created.add(copyRef)
      const placed = matrix ? multiplyMatrices(matrix, source.matrix) : source.matrix
      place(copyRef, {ref: copyRef, matrix: placed, props: source.props, geometry: source.geometry})
    },
    transform(target, matrix) {
      calls.push(['transform', target])
      const element = get(target)
      element.matrix = multiplyMatrices(matrix, element.matrix)
    },
    getMatrix: (target) => [...get(target).matrix],
    setMatrix(target, matrix) {
      get(target).matrix = [...matrix]
    },
    getProperty: (target, key) => get(target).props[key] ?? null,
    setProperty(target, key, value) {
      calls.push(['setProperty', target, key])
      const props = get(target).props
      if (value === null) {
        delete props[key]
      } else {
        props[key] = value
      }
    },
    getGeometry: (target) => get(target).geometry,
    setGeometry(target, geometry) {
      calls.push(['setGeometry', target])
      get(target).geometry = geometry
    },
  }

  /**
   * The document state, without per-load ids: what "identity" is judged on.
   *
   * @return {object} `{[ref]: {matrix, props, geometry}}`
   */
  const state = () => {
    const out = {}
    for (const element of live.values()) {
      out[element.ref] = {matrix: element.matrix, props: element.props, geometry: element.geometry}
    }
    return structuredClone(out)
  }

  /** @return {Array<number>} the live elements' batch ids */
  const batchIds = () => [...live.values()].map(({row}) => row.batchId)

  return {backend, resolver, state, batchIds, calls}
}
