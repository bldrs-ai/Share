/* eslint-disable no-magic-numbers */
import SearchIndex from './SearchIndex'


jest.mock('@bldrs-ai/ifclib', () => ({
  getType: (model, elt) => (elt && elt.type) || null,
  getName: (elt) => (elt && elt.Name && elt.Name.value) || null,
  reifyName: (model, elt) => (elt && elt.LongName && elt.LongName.value) || null,
  getDescription: (elt) => (elt && elt.Description && elt.Description.value) || null,
}))


/**
 * Build an IFC-like element.
 *
 * @param {object} overrides
 * @return {object}
 */
function makeElt(overrides = {}) {
  return {
    children: [],
    ...overrides,
  }
}


describe('search/SearchIndex', () => {
  let index
  let model

  beforeEach(() => {
    index = new SearchIndex()
    model = {} // `model` is opaque to the index — just needs to exist.
  })


  describe('tokenize', () => {
    it('splits a string into a set of word tokens', () => {
      const tokens = index.tokenize('Exterior Concrete Wall')
      expect(tokens).toBeInstanceOf(Set)
      expect(Array.from(tokens).sort()).toEqual(['Concrete', 'Exterior', 'Wall'])
    })

    it('handles punctuation and multiple spaces', () => {
      const tokens = index.tokenize('Level-1: foo,  bar!')
      expect(Array.from(tokens).sort()).toEqual(['1', 'Level', 'bar', 'foo'])
    })
  })


  describe('indexElement + search', () => {
    it('finds an element by its exact IFC type', () => {
      const wall = makeElt({
        expressID: 42,
        type: 'IFCWALL',
        GlobalId: {value: 'gid-wall'},
      })
      index.indexElement(model, wall)

      expect(index.search('IFCWALL')).toEqual([42])
    })

    it('also indexes the type with the IFC prefix stripped', () => {
      const wall = makeElt({expressID: 7, type: 'IFCWALL'})
      index.indexElement(model, wall)

      expect(index.search('WALL')).toEqual([7])
    })

    it('is case-insensitive on types', () => {
      const door = makeElt({expressID: 9, type: 'IFCDOOR'})
      index.indexElement(model, door)

      expect(index.search('ifcdoor')).toEqual([9])
      expect(index.search('door')).toEqual([9])
    })

    it('finds an element by its exact Name', () => {
      const elt = makeElt({
        expressID: 1,
        type: 'IFCWALL',
        Name: {value: 'Exterior Wall'},
      })
      index.indexElement(model, elt)

      expect(index.search('Exterior Wall')).toEqual([1])
    })

    it('finds an element by a single token of its Name', () => {
      const elt = makeElt({
        expressID: 1,
        type: 'IFCWALL',
        Name: {value: 'Exterior Concrete Wall'},
      })
      index.indexElement(model, elt)

      expect(index.search('Concrete')).toEqual([1])
      expect(index.search('exterior')).toEqual([1])
    })

    it('finds an element by its GlobalId', () => {
      const elt = makeElt({
        expressID: 11,
        type: 'IFCDOOR',
        GlobalId: {value: '0aBcDeFgHiJkLmNoPqRsTu'},
      })
      index.indexElement(model, elt)

      expect(index.search('0aBcDeFgHiJkLmNoPqRsTu')).toEqual([11])
    })

    it('finds an element by its expressID string', () => {
      const elt = makeElt({expressID: 123, type: 'IFCWALL'})
      index.indexElement(model, elt)

      expect(index.search('123')).toEqual([123])
    })

    it('recurses into children', () => {
      const grandchild = makeElt({expressID: 3, type: 'IFCDOOR'})
      const child = makeElt({
        expressID: 2,
        type: 'IFCBUILDINGSTOREY',
        children: [grandchild],
      })
      const root = makeElt({
        expressID: 1,
        type: 'IFCPROJECT',
        children: [child],
      })

      index.indexElement(model, root)

      expect(index.search('IFCDOOR').sort()).toEqual([3])
      expect(index.search('IFCPROJECT').sort()).toEqual([1])
      expect(index.search('IFCBUILDINGSTOREY').sort()).toEqual([2])
    })

    it('returns every expressID that matches the type', () => {
      index.indexElement(model, makeElt({expressID: 1, type: 'IFCPROJECT', children: [
        makeElt({expressID: 10, type: 'IFCWALL'}),
        makeElt({expressID: 20, type: 'IFCWALL'}),
        makeElt({expressID: 30, type: 'IFCDOOR'}),
      ]}))

      expect(index.search('IFCWALL').sort((a, b) => a - b)).toEqual([10, 20])
    })

    it('filters out matches whose expressID is missing or not a number', () => {
      // Element with no expressID should not produce a result even though
      // its name is indexed.
      const noId = makeElt({type: 'IFCWALL', Name: {value: 'Ghost'}})
      const real = makeElt({expressID: 5, type: 'IFCWALL', Name: {value: 'Ghost'}})
      index.indexElement(model, noId)
      index.indexElement(model, real)

      expect(index.search('Ghost')).toEqual([5])
    })

    it('returns an empty array on a complete miss', () => {
      index.indexElement(model, makeElt({expressID: 1, type: 'IFCWALL'}))
      expect(index.search('NOTHING_MATCHES')).toEqual([])
    })
  })


  describe('clearIndex', () => {
    it('removes all previously-indexed entries', () => {
      index.indexElement(model, makeElt({expressID: 1, type: 'IFCWALL'}))
      expect(index.search('IFCWALL')).toEqual([1])

      index.clearIndex()

      expect(index.search('IFCWALL')).toEqual([])
      expect(index.search('WALL')).toEqual([])
    })
  })


  describe('getGlobalIdByExpressId / getExpressIdByGlobalId', () => {
    it('round-trips between GlobalId and expressID', () => {
      const elt = makeElt({
        expressID: 77,
        type: 'IFCDOOR',
        GlobalId: {value: 'GID-XYZ'},
      })
      index.indexElement(model, elt)

      expect(index.getGlobalIdByExpressId('77')).toBe('GID-XYZ')
      expect(index.getExpressIdByGlobalId('GID-XYZ')).toBe('77')
    })

    it('returns undefined for unknown ids', () => {
      expect(index.getGlobalIdByExpressId('9999')).toBeUndefined()
      expect(index.getExpressIdByGlobalId('no-such-gid')).toBeUndefined()
    })
  })
})
