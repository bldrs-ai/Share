/* eslint-disable no-magic-numbers */
import {captureBldrsSpatialTree} from '../../loader/bldrsSpatialTree'
import {makeFakeEditModel, translation} from './editBackend.fixture'
import {seededRandomBytes} from './edit.fixture'
import {
  EditDirection,
  EditInconsistentError,
  applyEditOp,
  ifcGlobalIdIndex,
  makeEditRefResolver,
  resolveEditRefs,
  revertEditOp,
} from './editApply'
import {EMPTY_EDIT_LOG, appliedOps, recordApplied} from './editLog'
import {makeEditOp} from './editOps'


const WALL_GID = '3hm2qpxcLC2QR6PjoCX$Ma'
const DOOR_GID = '1Bd8Kc$Pr2ExS0vV8q9Zz0'
const WALL = `g${WALL_GID}`
const DOOR = `g${DOOR_GID}`
const NOWHERE = 'g0000000000000000000000'


/** @return {object} a fake model with a wall and a door */
function model() {
  return makeFakeEditModel({
    elements: [
      {expressID: 771, globalId: WALL_GID, props: {Name: 'Wall'}},
      {expressID: 812, globalId: DOOR_GID, props: {Name: 'Door'}, matrix: translation([5, 0, 0])},
    ],
    namePaths: {'nSite/Wall': 771},
    occurrences: {'o40.41': 812},
  })
}


/**
 * @param {object} spec makeEditOp spec, layer defaulted to document here
 * @param {number} seed
 * @return {object}
 */
function opOf(spec, seed = 1) {
  return makeEditOp({layer: 'document', ...spec}, {randomBytes: seededRandomBytes(seed)})
}


const EVERY_KIND = [
  ['create', {kind: 'create', payload: {props: {Name: 'Box'}, geometry: {box: [1, 2, 3]}, matrix: translation([0, 0, 9])}}],
  ['delete', {kind: 'delete', targets: [WALL, DOOR]}],
  ['transform', {kind: 'transform', targets: [WALL, DOOR], payload: {matrix: translation([0, 3, 0])}}],
  ['duplicate', {kind: 'duplicate', targets: [WALL, DOOR]}],
  ['duplicate (placed)', {kind: 'duplicate', targets: [DOOR], payload: {matrix: translation([0, 0, 4])}}],
  ['setProperty (replace)', {kind: 'setProperty', targets: [WALL, DOOR], payload: {key: 'Name', value: 'Renamed'}}],
  ['setProperty (add)', {kind: 'setProperty', targets: [WALL], payload: {key: 'FireRating', value: 'EI60'}}],
  ['setProperty (remove)', {kind: 'setProperty', targets: [WALL], payload: {key: 'Name', value: null}}],
  ['setGeometry', {kind: 'setGeometry', targets: [DOOR], payload: {geometry: {box: [2, 2, 2]}}}],
]


describe('viewer/edit/editApply', () => {
  describe.each(EVERY_KIND)('%s', (name, spec) => {
    it('apply → undo → redo is the identity on the backend', () => {
      const {backend, resolver, state} = model()
      const op = opOf(spec)
      const before = state()

      const applied = applyEditOp(op, {backend, resolver})
      expect(applied.ok).toBe(true)
      const after = state()
      // The op did something, or identity below would prove nothing.
      expect(after).not.toEqual(before)

      expect(revertEditOp(op, applied.undo, {backend, resolver})).toEqual({ok: true})
      expect(state()).toEqual(before)

      expect(applyEditOp(op, {backend, resolver}).ok).toBe(true)
      expect(state()).toEqual(after)
    })
  })

  it('resolves a ref to an element an earlier create minted, across undo and redo', () => {
    const {backend, resolver, state} = model()
    const create = opOf({kind: 'create', payload: {geometry: {box: [1, 1, 1]}}}, 5)
    const [box] = create.targets
    const move = opOf({kind: 'transform', targets: [box], payload: {matrix: translation([1, 2, 3])}}, 6)

    // Before the create is applied, nothing is named by its ref.
    expect(resolver.resolve(box)).toEqual({reason: 'no element with this GlobalId in the loaded model'})

    const created = applyEditOp(create, {backend, resolver})
    const moved = applyEditOp(move, {backend, resolver})
    expect(moved.ok).toBe(true)
    expect(state()[box].matrix).toEqual(translation([1, 2, 3]))

    expect(revertEditOp(move, moved.undo, {backend, resolver}).ok).toBe(true)
    expect(revertEditOp(create, created.undo, {backend, resolver}).ok).toBe(true)
    expect(state()[box]).toBeUndefined()

    // Redo re-creates the SAME element under the same ref, so the move that
    // targets it still resolves.
    expect(applyEditOp(create, {backend, resolver}).ok).toBe(true)
    expect(applyEditOp(move, {backend, resolver}).ok).toBe(true)
    expect(state()[box].matrix).toEqual(translation([1, 2, 3]))
  })

  it('addresses n and o targets as well as g', () => {
    const {backend, resolver, state} = model()
    const op = opOf({kind: 'setProperty', targets: ['nSite/Wall', 'o40.41'], payload: {key: 'Tag', value: 'x'}})
    expect(applyEditOp(op, {backend, resolver}).ok).toBe(true)
    expect(state()[WALL].props.Tag).toBe('x')
    expect(state()[DOOR].props.Tag).toBe('x')
  })

  it('reports every unresolved target and changes nothing', () => {
    const {backend, resolver, state, calls} = model()
    const before = state()
    const op = opOf({kind: 'delete', targets: [WALL, NOWHERE, 'nSite/Roof']})
    expect(applyEditOp(op, {backend, resolver})).toEqual({
      ok: false,
      reason: 'unresolved refs; nothing was changed',
      unresolved: [
        {ref: NOWHERE, reason: 'no element with this GlobalId in the loaded model'},
        {ref: 'nSite/Roof', reason: 'no node at this name path'},
      ],
    })
    // The wall resolved, and is still there: all or nothing.
    expect(state()).toEqual(before)
    expect(calls).toEqual([])
  })

  it('refuses an invalid op before touching the backend', () => {
    const {backend, resolver, calls} = model()
    const result = applyEditOp({id: 'x', kind: 'delete', targets: ['e771'], payload: {}, layer: 'document'},
      {backend, resolver})
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/g<GlobalId>/)
    expect(calls).toEqual([])
  })


  /**
   * Make one backend method, on its `n`th call from now, do its work and
   * THEN throw, once: the step no compensation could count (review of #2346,
   * round 3).
   *
   * @param {object} backend
   * @param {string} method
   * @param {number} n
   */
  function mutateThenThrow(backend, method, n) {
    const original = backend[method]
    let count = 0
    backend[method] = (...args) => {
      const result = original(...args)
      if (++count === n) {
        throw new Error(`${method} failed after mutating`)
      }
      return result
    }
  }


  /**
   * @param {Function} fn
   * @return {Error} what `fn` threw
   */
  function thrown(fn) {
    try {
      fn()
    } catch (error) {
      return error
    }
    throw new Error('expected a throw')
  }


  /**
   * Wrap a backend so every method call is counted, reads included.
   *
   * @param {object} backend
   * @return {object} `{spy, seen}`
   */
  function spyOn(backend) {
    const seen = []
    const spy = new Proxy(backend, {
      get: (target, method) => (...args) => {
        seen.push(method)
        return target[method](...args)
      },
    })
    return {spy, seen}
  }


  describe('fail-stop', () => {
    const transformBoth = {kind: 'transform', targets: [WALL, DOOR], payload: {matrix: translation([0, 3, 0])}}

    it.each([EditDirection.APPLY, EditDirection.REDO])(
      '%s: a step that mutates and then throws is an EditInconsistentError, and nothing is put back', (direction) => {
        const {backend, resolver, state} = model()
        const before = state()
        const op = opOf(transformBoth)
        // The wall's transform returns; the door's moves the door, then throws.
        mutateThenThrow(backend, 'transform', 2)
        const error = thrown(() => applyEditOp(op, {backend, resolver}, direction))
        expect(error).toBeInstanceOf(EditInconsistentError)
        expect(error.cause.message).toBe('transform failed after mutating')
        expect(error.direction).toBe(direction)
        expect(error.op.id).toBe(op.id)
        // Both moved and both stay moved: no rollback of the wall, and none
        // of the door's half-done step.
        expect(state()[WALL].matrix).toEqual(translation([0, 3, 0]))
        expect(state()[DOOR].matrix).toEqual(translation([5, 3, 0]))
        expect(state()).not.toEqual(before)
      })

    it('undo: a revert step that mutates and then throws is an EditInconsistentError, and nothing is re-applied', () => {
      const {backend, resolver, state} = model()
      const before = state()
      const op = opOf(transformBoth)
      const applied = applyEditOp(op, {backend, resolver})
      // Revert runs newest first: the door's setMatrix returns, the wall's
      // writes the wall back, then throws.
      mutateThenThrow(backend, 'setMatrix', 2)
      const error = thrown(() => revertEditOp(op, applied.undo, {backend, resolver}))
      expect(error).toBeInstanceOf(EditInconsistentError)
      expect(error.cause.message).toBe('setMatrix failed after mutating')
      expect(error.direction).toBe(EditDirection.UNDO)
      expect(error.op).toBe(op)
      // Both reverted, and the door's revert was not re-applied over it.
      expect(state()).toEqual(before)
    })

    it('a resolver that throws is an EditInconsistentError too', () => {
      const {backend} = model()
      const resolver = {
        resolve() {
          throw new Error('index corrupt')
        },
      }
      const op = opOf(transformBoth)
      const applyError = thrown(() => applyEditOp(op, {backend, resolver}))
      expect(applyError).toBeInstanceOf(EditInconsistentError)
      expect(applyError.cause.message).toBe('index corrupt')
      const undoError = thrown(() => revertEditOp(op, {matrices: []}, {backend, resolver}))
      expect(undoError).toBeInstanceOf(EditInconsistentError)
      expect(undoError.direction).toBe(EditDirection.UNDO)
    })
  })


  describe('resolve before the first backend call', () => {
    it('makes zero backend calls, reads included, when only the last of several targets is unresolved', () => {
      const {backend, resolver} = model()
      const {spy, seen} = spyOn(backend)
      const op = opOf({kind: 'transform', targets: [WALL, DOOR, NOWHERE], payload: {matrix: translation([0, 1, 0])}})
      expect(applyEditOp(op, {backend: spy, resolver})).toEqual({
        ok: false,
        reason: 'unresolved refs; nothing was changed',
        unresolved: [{ref: NOWHERE, reason: 'no element with this GlobalId in the loaded model'}],
      })
      expect(seen).toEqual([])
    })

    it('makes zero backend calls for an undo whose last target is unresolved', () => {
      const {backend, resolver} = model()
      const op = opOf({kind: 'setProperty', targets: [WALL, DOOR], payload: {key: 'Name', value: 'X'}})
      const applied = applyEditOp(op, {backend, resolver})
      // A view-layer eviction of the door: not in history.
      expect(applyEditOp(opOf({kind: 'delete', targets: [DOOR], layer: 'view'}, 2), {backend, resolver}).ok)
        .toBe(true)
      const {spy, seen} = spyOn(backend)
      expect(revertEditOp(op, applied.undo, {backend: spy, resolver})).toEqual({
        ok: false,
        reason: 'unresolved refs; nothing was reverted',
        unresolved: [{ref: DOOR, reason: 'element is deleted'}],
      })
      expect(seen).toEqual([])
    })
  })


  it('applies and records one canonical object: the op the backend saw is the op in the log', () => {
    const {backend, resolver} = model()
    let seen
    const create = backend.create
    backend.create = (ref, payload) => {
      seen = payload
      create(ref, payload)
    }
    const literal = {id: 'op1', kind: 'create', targets: [DOOR.replace('g1', 'g2')], layer: 'document',
      payload: {geometry: {box: [1, -0, 1]}}}
    const result = applyEditOp(literal, {backend, resolver})
    expect(result.ok).toBe(true)
    const [recorded] = appliedOps(recordApplied(EMPTY_EDIT_LOG, result.op, result.undo))
    expect(recorded).toBe(result.op)
    expect(seen).toBe(recorded.payload)
    expect(recorded).not.toBe(literal)
    // -0 is normalized to 0, as JSON would write it.
    expect(Object.is(recorded.payload.geometry.box[1], 0)).toBe(true)
    expect(Object.isFrozen(recorded.payload.geometry)).toBe(true)
  })

  it('refuses a non-JSON payload before the backend sees it', () => {
    const {backend, resolver, calls} = model()
    const literal = {id: 'op1', kind: 'create', targets: [DOOR.replace('g1', 'g2')], layer: 'document',
      payload: {size: 10n}}
    const result = applyEditOp(literal, {backend, resolver})
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/payload.size: bigint is not plain JSON/)
    expect(calls).toEqual([])
  })

  it('reports an undo whose target a later view op removed, and reverts nothing', () => {
    const {backend, resolver, state} = model()
    const move = opOf({kind: 'transform', targets: [WALL], payload: {matrix: translation([1, 0, 0])}})
    const moved = applyEditOp(move, {backend, resolver})
    const evict = opOf({kind: 'delete', targets: [WALL], layer: 'view'}, 2)
    expect(applyEditOp(evict, {backend, resolver}).ok).toBe(true)
    const afterEvict = state()
    expect(revertEditOp(move, moved.undo, {backend, resolver})).toEqual({
      ok: false,
      reason: 'unresolved refs; nothing was reverted',
      unresolved: [{ref: WALL, reason: 'element is deleted'}],
    })
    expect(state()).toEqual(afterEvict)
  })

  describe('makeEditRefResolver', () => {
    it('reports a ref of a kind the model has no lookup for', () => {
      const resolver = makeEditRefResolver({g: () => ({target: 1})})
      expect(resolveEditRefs([WALL, 'o1.2', 'bogus'], resolver)).toEqual({
        targets: [1],
        unresolved: [
          {ref: 'o1.2', reason: 'this model has no o refs'},
          {ref: 'bogus', reason: 'not an edit ref'},
        ],
      })
    })
  })

  describe('ifcGlobalIdIndex', () => {
    const tree = {
      expressID: 1,
      GlobalId: {value: '0aaaaaaaaaaaaaaaaaaaaa'},
      children: [
        {expressID: 771, GlobalId: {value: WALL_GID}, children: []},
        {expressID: 812, GlobalId: {value: DOOR_GID}, children: [
          {expressID: 900, GlobalId: {value: DOOR_GID}, children: []},
        ]},
      ],
    }

    it('maps a GlobalId to its expressID, exactly', () => {
      const lookup = ifcGlobalIdIndex(tree)
      expect(lookup(WALL_GID)).toEqual({expressID: 771})
      expect(lookup('0aaaaaaaaaaaaaaaaaaaaa')).toEqual({expressID: 1})
      // GlobalIds are case-sensitive: SearchIndex also indexes the
      // lower-cased form, which here would name the wall.
      expect(lookup(WALL_GID.toLowerCase())).toEqual({reason: 'no element with this GlobalId in the loaded model'})
    })

    it('reports a GlobalId two elements share instead of picking one', () => {
      expect(ifcGlobalIdIndex(tree)(DOOR_GID)).toEqual({
        reason: 'GlobalId is not unique in this model (expressIDs 812, 900)',
      })
    })

    it('finds nothing in the tree a cache-hit load reads (BLDRS_spatial_tree drops GlobalId)', async () => {
      // The tree the GLB writer stores, from the same live tree. A fresh
      // parse's 'names' tree carries GlobalId on every node (public/index.ifc:
      // 11 of 11); the artifact's carries none, so on a cache hit every
      // source g ref is unresolved. model-edit.md §5.1. When the artifact
      // gains GlobalId this test flips, and L2 can rely on it.
      const cached = await captureBldrsSpatialTree({getSpatialStructure: () => Promise.resolve(tree)}, 0)
      expect(cached.children.map((n) => n.expressID)).toEqual([771, 812])
      expect(ifcGlobalIdIndex(cached)(WALL_GID)).toEqual({reason: 'no element with this GlobalId in the loaded model'})
    })
  })
})
