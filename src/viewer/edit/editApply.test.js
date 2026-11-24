/* eslint-disable no-magic-numbers */
import {captureBldrsSpatialTree} from '../../loader/bldrsSpatialTree'
import {makeFakeEditModel, translation} from './editBackend.fixture'
import {seededRandomBytes} from './edit.fixture'
import {applyEditOp, ifcGlobalIdIndex, makeEditRefResolver, resolveEditRefs, revertEditOp} from './editApply'
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

  it('rolls a multi-target op back when the backend throws part way, then rethrows', () => {
    const {backend, resolver, state} = model()
    const before = state()
    const transform = backend.transform
    let count = 0
    backend.transform = (target, matrix) => {
      if (++count === 2) {
        throw new Error('allocation failed')
      }
      transform(target, matrix)
    }
    const op = opOf({kind: 'transform', targets: [WALL, DOOR], payload: {matrix: translation([0, 3, 0])}})
    expect(() => applyEditOp(op, {backend, resolver})).toThrow('allocation failed')
    expect(state()).toEqual(before)
  })

  it('rolls back a partly applied duplicate by deleting the copies it made', () => {
    const {backend, resolver, state} = model()
    const before = state()
    const duplicate = backend.duplicate
    let count = 0
    backend.duplicate = (...args) => {
      if (++count === 2) {
        throw new Error('no headroom')
      }
      duplicate(...args)
    }
    expect(() => applyEditOp(opOf({kind: 'duplicate', targets: [WALL, DOOR]}), {backend, resolver}))
      .toThrow('no headroom')
    expect(state()).toEqual(before)
  })

  /**
   * Make one backend method throw on its `n`th call from now, once.
   *
   * @param {object} backend
   * @param {string} method
   * @param {number} n
   * @return {Function} restores the original method
   */
  function failNth(backend, method, n) {
    const original = backend[method]
    let count = 0
    backend[method] = (...args) => {
      if (++count === n) {
        throw new Error(`${method} failed`)
      }
      return original(...args)
    }
    return () => {
      backend[method] = original
    }
  }

  it.each([
    // [kind, spec, the revert method that fails on its 2nd call]
    ['delete', {kind: 'delete', targets: [WALL, DOOR]}, 'restore'],
    ['transform', {kind: 'transform', targets: [WALL, DOOR], payload: {matrix: translation([0, 3, 0])}}, 'setMatrix'],
    ['duplicate', {kind: 'duplicate', targets: [WALL, DOOR]}, 'delete'],
    ['setProperty', {kind: 'setProperty', targets: [WALL, DOOR], payload: {key: 'Name', value: 'X'}}, 'setProperty'],
    ['setGeometry', {kind: 'setGeometry', targets: [WALL, DOOR], payload: {geometry: {box: [2, 2, 2]}}}, 'setGeometry'],
  ])('rolls a partly reverted %s back when the backend throws, so a retry succeeds', (kind, spec, method) => {
    const {backend, resolver, state} = model()
    const before = state()
    const op = opOf(spec)
    const applied = applyEditOp(op, {backend, resolver})
    const after = state()
    const heal = failNth(backend, method, 2)
    expect(() => revertEditOp(op, applied.undo, {backend, resolver})).toThrow(`${method} failed`)
    // The first target's revert ran and was re-applied: nothing moved.
    expect(state()).toEqual(after)
    heal()
    expect(revertEditOp(op, applied.undo, {backend, resolver})).toEqual({ok: true})
    expect(state()).toEqual(before)
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
