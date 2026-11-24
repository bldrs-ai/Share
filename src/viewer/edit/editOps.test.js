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
      ['a transform with a NaN', {kind: 'transform', payload: {matrix: [...IDENTITY.slice(1), NaN]}}, /16 finite/],
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
      ['a setProperty with a NaN', {kind: 'setProperty', payload: {key: 'Height', value: NaN}}, /string, number/],
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
    ])('rejects %s', (name, fields, reason) => {
      expect(validateEditOp(fields === null ? null : op(fields))).toMatch(reason)
    })
  })
})
