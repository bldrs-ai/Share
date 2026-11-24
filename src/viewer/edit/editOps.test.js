/* eslint-disable no-magic-numbers */
import {seededRandomBytes} from './edit.fixture'
import {EditOpError, makeEditOp, validateEditOp} from './editOps'
import {isGlobalId} from './globalId'


const WALL = 'g3hm2qpxcLC2QR6PjoCX$Ma'
const DOOR = 'g1Bd8Kc$Pr2ExS0vV8q9Zz0'
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


/**
 * @param {object} fields
 * @return {object} a valid document delete, with `fields` over it
 */
function op(fields) {
  return {id: 'op1', kind: 'delete', targets: [WALL], payload: {}, layer: 'document', ...fields}
}


describe('viewer/edit/editOps', () => {
  describe('makeEditOp', () => {
    it('mints a create op\'s target as a g ref when the op is made', () => {
      const created = makeEditOp({kind: 'create', layer: 'document', payload: {ifcClass: 'IfcWall'}},
        {randomBytes: seededRandomBytes(3)})
      expect(created.targets).toHaveLength(1)
      expect(created.targets[0][0]).toBe('g')
      expect(isGlobalId(created.targets[0].substring(1))).toBe(true)
      // Same seed, same op: minting is in the op, not left to apply.
      expect(makeEditOp({kind: 'create', layer: 'document', payload: {ifcClass: 'IfcWall'}},
        {randomBytes: seededRandomBytes(3)})).toEqual(created)
    })

    it('mints one copy ref per duplicated target, all distinct', () => {
      const dup = makeEditOp({kind: 'duplicate', layer: 'document', targets: [WALL, DOOR], payload: {matrix: IDENTITY}})
      expect(dup.payload.copies).toHaveLength(2)
      expect(new Set([...dup.payload.copies, WALL, DOOR]).size).toBe(4)
      expect(dup.payload.matrix).toEqual(IDENTITY)
    })

    it('makes plain JSON', () => {
      const made = makeEditOp({kind: 'transform', layer: 'document', targets: [WALL], payload: {matrix: IDENTITY}})
      expect(JSON.parse(JSON.stringify(made))).toEqual(made)
    })

    it('requires a layer and never defaults one', () => {
      expect(() => makeEditOp({kind: 'delete', targets: [WALL]})).toThrow(EditOpError)
      expect(() => makeEditOp({kind: 'delete', targets: [WALL], layer: 'scene'})).toThrow(/layer/)
    })

    it('refuses caller-chosen refs for what it mints', () => {
      expect(() => makeEditOp({kind: 'create', layer: 'document', targets: [WALL]})).toThrow(/mints/)
      expect(() => makeEditOp({kind: 'duplicate', layer: 'document', targets: [WALL], payload: {copies: [DOOR]}}))
        .toThrow(/mints/)
    })
  })

  it('accepts a shared (acyclic) sub-object, and normalizes -0', () => {
    const shared = [0, -0, 1]
    const made = makeEditOp({kind: 'create', layer: 'document', payload: {a: shared, b: shared}})
    expect(made.payload.a).toEqual([0, 0, 1])
    expect(Object.is(made.payload.a[1], 0)).toBe(true)
    expect(made.payload.b).toEqual([0, 0, 1])
  })

  describe('validateEditOp', () => {
    it('accepts a valid op of every kind', () => {
      expect(validateEditOp(op({}))).toBeNull()
      expect(validateEditOp(op({layer: 'view'}))).toBeNull()
      expect(validateEditOp(op({kind: 'create', targets: [DOOR], payload: {}}))).toBeNull()
      expect(validateEditOp(op({kind: 'transform', payload: {matrix: IDENTITY}}))).toBeNull()
      expect(validateEditOp(op({kind: 'duplicate', payload: {copies: [DOOR]}}))).toBeNull()
      expect(validateEditOp(op({kind: 'duplicate', payload: {copies: [DOOR], matrix: IDENTITY}}))).toBeNull()
      expect(validateEditOp(op({kind: 'create', targets: [DOOR], payload: {ifcClass: 'IfcWall', psets: {
        Pset_WallCommon: {FireRating: 'EI60'}}, geometry: {profile: [[0, 0], [1, 0], [1, 1]], depth: 3}}}))).toBeNull()
      expect(validateEditOp(op({kind: 'setProperty', payload: {key: 'Name', value: null}}))).toBeNull()
      expect(validateEditOp(op({kind: 'setGeometry', payload: {geometry: {box: [1, 1, 1]}}}))).toBeNull()
      // A set of targets, as a scope will carry.
      expect(validateEditOp(op({targets: [WALL, DOOR, 'o1.2', 'nA/B']}))).toBeNull()
    })

    it.each([
      ['not an object', null, /object/],
      ['no id', {id: ''}, /op.id/],
      ['an unknown kind', {kind: 'paint'}, /unknown op kind/],
      ['no layer', {layer: undefined}, /op.layer/],
      ['no targets', {targets: []}, /non-empty array/],
      ['a bare ref instead of a list', {targets: WALL}, /non-empty array/],
      ['an expressID target', {targets: ['e771']}, /g<GlobalId>/],
      ['a malformed target', {targets: ['gshort']}, /not an edit ref/],
      ['a repeated target', {targets: [WALL, WALL]}, /repeats/],
      ['no payload', {payload: null}, /payload must be an object/],
      ['a create with two targets', {kind: 'create', targets: [WALL, DOOR]}, /exactly one/],
      ['a create named by a non-g ref', {kind: 'create', targets: ['o1']}, /g<GlobalId>/],
      ['a transform without a matrix', {kind: 'transform', payload: {}}, /16 finite/],
      ['a transform with a NaN', {kind: 'transform', payload: {matrix: [...IDENTITY.slice(1), NaN]}},
        /payload.matrix.15: NaN is not plain JSON/],
      ['a duplicate without copies', {kind: 'duplicate', payload: {}}, /one created ref per target/],
      ['a duplicate copying onto its source', {kind: 'duplicate', payload: {copies: [WALL]}}, /new refs/],
      ['a duplicate copy named by a non-g ref', {kind: 'duplicate', payload: {copies: ['nA']}}, /g<GlobalId>/],
      ['a setProperty without a key', {kind: 'setProperty', payload: {value: 1}}, /key/],
      ['a setProperty value JSON would drop', {kind: 'setProperty', payload: {key: 'Name', value: undefined}}, /null removes/],
      ['a setGeometry without geometry', {kind: 'setGeometry', payload: {}}, /geometry must be an object/],
      ['a GlobalId past the 128-bit range', {targets: [`gZ${'0'.repeat(21)}`]}, /not an edit ref/],
      ['a duplicate with a bad matrix', {kind: 'duplicate', payload: {copies: [DOOR], matrix: [1]}}, /16 finite/],
      ['a setProperty with a structured value', {kind: 'setProperty', payload: {key: 'Name', value: {v: 1}}},
        /string, number, boolean or null/],
      ['a setProperty with a NaN', {kind: 'setProperty', payload: {key: 'Height', value: NaN}}, /payload.value: NaN is not plain JSON/],
      // Per-load ids (model-edit.md §5) must never reach the persisted log.
      ['an envelope key it does not define', {batchId: 7}, /op has unknown key "batchId"/],
      ['a delete carrying a batchId', {payload: {batchId: 7}}, /delete payload has unknown key "batchId"/],
      ['a transform carrying an expressID', {kind: 'transform', payload: {matrix: IDENTITY, expressID: 771}}, /unknown key "expressID"/],
      ['a duplicate carrying an instanceId', {kind: 'duplicate', payload: {copies: [DOOR], instanceId: 3}}, /unknown key "instanceId"/],
      ['a setProperty carrying an occurrenceId', {kind: 'setProperty', payload: {key: 'Name', value: 'x', occurrenceId: 1}},
        /unknown key "occurrenceId"/],
      ['a setGeometry nesting a geometryId', {kind: 'setGeometry', payload: {geometry: {box: [1, 1, 1], geometryId: 2}}},
        /per-load id "geometryId" at payload.geometry.geometryId/],
      ['a create nesting a batchId in an array', {kind: 'create', targets: [DOOR], payload: {parts: [{ok: 1}, {batchId: 1}]}},
        /per-load id "batchId" at payload.parts.1.batchId/],
      ['a create carrying an expressId', {kind: 'create', targets: [DOOR], payload: {expressId: 9}}, /per-load id "expressId"/],
      ['a create carrying an occurrence path', {kind: 'create', targets: [DOOR], payload: {occurrencePath: [1, 2]}},
        /per-load id "occurrencePath"/],
      // Not plain JSON: refused before anything reads it (review of #2346).
      ['a Map', {kind: 'create', targets: [DOOR], payload: {psets: new Map([['a', 1]])}}, /payload.psets: Map is not plain JSON/],
      ['a Set', {kind: 'create', targets: [DOOR], payload: {tags: new Set([1])}}, /payload.tags: Set is not plain JSON/],
      ['a typed array', {kind: 'setGeometry', payload: {geometry: {positions: new Float32Array(3)}}},
        /payload.geometry.positions: Float32Array is not plain JSON/],
      ['a Date', {kind: 'create', targets: [DOOR], payload: {at: new Date(0)}}, /payload.at: Date is not plain JSON/],
      ['a class instance', {kind: 'create', targets: [DOOR], payload: {shape: new (class Box {})()}}, /Box is not plain JSON/],
      ['a BigInt', {kind: 'create', targets: [DOOR], payload: {n: 1n}}, /payload.n: bigint is not plain JSON/],
      ['a function', {kind: 'create', targets: [DOOR], payload: {f: () => 1}}, /payload.f: function is not plain JSON/],
      ['a symbol', {kind: 'create', targets: [DOOR], payload: {s: Symbol('x')}}, /payload.s: symbol is not plain JSON/],
      ['a non-finite number', {kind: 'create', targets: [DOOR], payload: {depth: Infinity}}, /payload.depth: Infinity is not/],
      ['a NaN in an opaque value', {kind: 'setGeometry', payload: {geometry: {depth: NaN}}}, /NaN is not plain JSON/],
      ['a hole in an array', {kind: 'create', targets: [DOOR], payload: {xs: new Array(3)}}, /payload.xs.0: undefined is not plain JSON/],
      ['a toJSON hook', {kind: 'create', targets: [DOOR], payload: {toJSON: () => ({})}}, /payload has a toJSON/],
      // The bypass: the deny-list scan saw a harmless object, JSON would
      // have written `{batchId: 7}`.
      ['a toJSON that would emit a per-load id', {kind: 'setGeometry', payload: {geometry: {box: [1, 1, 1],
        toJSON: () => ({batchId: 7})}}}, /payload.geometry has a toJSON/],
      ['a cycle', {kind: 'create', targets: [DOOR], payload: (() => {
        const p = {a: {}}
        p.a.back = p
        return p
      })()}, /payload.a.back: cycle/],
    ])('rejects %s', (name, fields, reason) => {
      expect(validateEditOp(fields === null ? null : op(fields))).toMatch(reason)
    })
  })
})
