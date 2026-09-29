/* eslint-disable no-magic-numbers */
import {Group, Mesh} from 'three'
import {
  applyHiddenDiff,
  diffHidden,
  elementRef,
  namePathRef,
  occurrenceRef,
  parseRef,
  sceneGraphNamePaths,
} from './visibilityRefs'


/**
 * The ADF-shaped tree sceneGraphVisibility.test.js uses, as the isolator's
 * `spatialStructure` (containers only):
 *
 *   0 ─ 1 ─┬─ 2 ─ 3            (2 hidden by the loader)
 *          └─ 4 ─┬─ 5 ─ 6
 *                └─ 7 ─ 8
 */
const childrenOf = {0: [1], 1: [2, 4], 2: [3], 4: [5, 7], 5: [6], 7: [8]}
const defaults = [2, 3]
const elementIds = [3, 6, 8]


/**
 * @param {Array<number>} hiddenIds
 * @return {object} the diff, and the hidden set decoded back from it
 */
function roundTrip(hiddenIds) {
  const diff = diffHidden({childrenOf, hiddenIds, defaultHiddenIds: defaults, elementIds})
  const back = applyHiddenDiff({childrenOf, ...diff, defaultHiddenIds: defaults, elementIds})
  return {diff, back: back.sort((a, b) => a - b)}
}


describe('viewer/visibilityRefs', () => {
  describe('refs', () => {
    it('writes and parses each kind', () => {
      expect(elementRef(1234)).toBe('e1234')
      expect(parseRef('e1234')).toEqual({kind: 'e', id: 1234})
      expect(occurrenceRef([1020254, 367733])).toBe('o1020254.367733')
      expect(parseRef('o1020254.367733')).toEqual({kind: 'o', ids: [1020254, 367733]})
      const segments = [{name: 'Upper Jaw', ordinal: 1}, {name: 'teeth', ordinal: 1}]
      expect(namePathRef(segments)).toBe('nUpper%20Jaw/teeth')
      expect(parseRef('nUpper%20Jaw/teeth')).toEqual({kind: 'n', segments})
    })

    it('escapes every separator the hash uses, and the ordinal marker', () => {
      const name = 'a,b;c=d:e+f/g~h i'
      const ref = namePathRef([{name, ordinal: 1}])
      expect(ref.substring(1)).not.toMatch(/[,;=:+/~ ]/)
      expect(parseRef(ref)).toEqual({kind: 'n', segments: [{name, ordinal: 1}]})
    })

    it('numbers same-named and unnamed siblings', () => {
      expect(namePathRef([{name: 'Mesh', ordinal: 2}])).toBe('nMesh~2')
      expect(namePathRef([{name: '', ordinal: 1}])).toBe('n~1')
      expect(parseRef('nMesh~2')).toEqual({kind: 'n', segments: [{name: 'Mesh', ordinal: 2}]})
      expect(parseRef('n~1')).toEqual({kind: 'n', segments: [{name: '', ordinal: 1}]})
    })

    it('rejects what it can\'t read, rather than guessing', () => {
      for (const bad of ['', 'x12', 'e', 'e12a', 'o', 'o1..2', 'nA~0', 'nA%E0', 'nA~2~3']) {
        expect(parseRef(bad)).toBeNull()
      }
    })
  })


  describe('hidden-state diff', () => {
    it('writes nothing for the loader\'s defaults', () => {
      expect(roundTrip([2, 3])).toEqual({diff: {hide: [], show: []}, back: [2, 3]})
    })

    it('writes a hidden subtree as its root', () => {
      // The eye on tooth 5 hides it and its crown.
      expect(roundTrip([2, 3, 5, 6])).toEqual({diff: {hide: [5], show: []}, back: [2, 3, 5, 6]})
    })

    it('writes a shown default as `show`', () => {
      // Show All: the overlay (and its curve) come on.
      expect(roundTrip([])).toEqual({diff: {hide: [], show: [2]}, back: []})
    })

    it('round-trips a child re-shown under a hidden parent, and one hidden again below it', () => {
      const {diff, back} = roundTrip([2, 3, 1, 2, 3, 4, 5, 6])
      // Everything under 1 hidden except 7's subtree.
      expect(diff).toEqual({hide: [1], show: [7]})
      expect(back).toEqual([1, 2, 3, 4, 5, 6])
      const deeper = roundTrip([1, 2, 3, 4, 5, 6, 8])
      expect(deeper.diff).toEqual({hide: [1, 8], show: [7]})
      expect(deeper.back).toEqual([1, 2, 3, 4, 5, 6, 8])
    })

    it('round-trips an element outside the tree', () => {
      expect(roundTrip([2, 3, 99])).toEqual({diff: {hide: [99], show: []}, back: [2, 3, 99]})
    })

    it('round-trips every subset of this tree', () => {
      const ids = [0, 1, 2, 3, 4, 5, 6, 7, 8]
      for (let mask = 0; mask < (1 << ids.length); mask++) {
        const hidden = ids.filter((id, i) => mask & (1 << i))
        expect(roundTrip(hidden).back).toEqual(hidden)
      }
    })
  })


  describe('scene-graph name paths', () => {
    /**
     * @param {string} name
     * @param {number} id
     * @param {Array<object>} children
     * @return {object}
     */
    function node(name, id, children = []) {
      const obj = children.length > 0 ? new Group() : new Mesh()
      obj.name = name
      obj.expressID = id
      if (id > 0) {
        // convertToShareModel's NavTree label.
        obj.Name = {value: name || 'Object'}
      }
      if (children.length > 0) {
        obj.add(...children)
      }
      return obj
    }

    it('addresses nodes by NavTree name, numbering repeats', () => {
      const root = node('scene', 0, [
        node('Upper Jaw', 1, [node('Tooth', 2), node('Tooth', 3), node('', 4)]),
      ])
      const {refOf, idOf} = sceneGraphNamePaths(root)
      expect([1, 2, 3, 4].map(refOf)).toEqual(
        ['nUpper%20Jaw', 'nUpper%20Jaw/Tooth', 'nUpper%20Jaw/Tooth~2', 'nUpper%20Jaw/Object'])
      for (const id of [0, 1, 2, 3, 4]) {
        expect(idOf(parseRef(refOf(id)).segments)).toBe(id)
      }
      expect(refOf(42)).toBeNull()
      expect(idOf(parseRef('nUpper%20Jaw/Tooth~3').segments)).toBeNull()
      expect(idOf(parseRef('nLower%20Jaw').segments)).toBeNull()
    })

    it('addresses a node whose name ends in half an emoji', () => {
      // A 200-code-unit name cap can cut a surrogate pair, and a lone
      // surrogate makes encodeURIComponent throw.
      const cut = 'Tooth \uD83E'
      const root = node('scene', 0, [node(cut, 1), node(`${cut}\uDDB7`, 2)])
      const {refOf, idOf} = sceneGraphNamePaths(root)
      expect(refOf(1)).toBe('nTooth%20%EF%BF%BD')
      expect(idOf(parseRef(refOf(1)).segments)).toBe(1)
      expect(idOf(parseRef(refOf(2)).segments)).toBe(2)
    })

    it('steps over untagged objects', () => {
      const wrapper = new Group()
      wrapper.add(node('Tooth', 2))
      const root = node('scene', 0, [node('Jaw', 1)])
      root.children[0].add(wrapper)
      const {refOf, idOf} = sceneGraphNamePaths(root)
      expect(refOf(2)).toBe('nJaw/Tooth')
      expect(idOf(parseRef('nJaw/Tooth').segments)).toBe(2)
    })
  })
})
