import {
  computeElementPathIds,
  setupLookupAndParentLinks,
} from './TreeUtils'


/**
 *Helper to create a mock IFC doc object tree.
 *
 * @return {object} The mock IFC obj.
 */
export function makeTestTree() {
  return {
    name: 'a',
    expressID: 0,
    children: [{
      name: 'b',
      expressID: 1,
      children: [{
        name: 'c',
        expressID: 2,
        children: [],
      }],
    }],
  }
}


test('Test setupLookupAndParentLinks', () => {
  const tree = makeTestTree()
  const eltsById = {}
  setupLookupAndParentLinks(tree, eltsById)
  const a = tree
  const b = tree.children[0]
  const c = tree.children[0].children[0]
  expect(b).toEqual(c.parent)
  expect(a).toEqual(b.parent)
  expect(undefined).toEqual(a.parent)
  expect(a).toEqual(eltsById[0])
  expect(b).toEqual(eltsById[1])
  expect(c).toEqual(eltsById[2])
})


test('Test computeElementPathIds', () => {
  const tree = makeTestTree()
  const a = tree
  const b = tree.children[0]
  const c = tree.children[0].children[0]
  const getIdCb = (elt) => elt.name
  expect(computeElementPathIds(a, getIdCb)).toEqual(['a'])
  expect(computeElementPathIds(b, getIdCb)).toEqual(['b'])
  expect(computeElementPathIds(c, getIdCb)).toEqual(['c'])
  const eltsById = {}
  setupLookupAndParentLinks(tree, eltsById)
  expect(computeElementPathIds(a, getIdCb)).toEqual(['a'])
  expect(computeElementPathIds(b, getIdCb)).toEqual(['a', 'b'])
  expect(computeElementPathIds(c, getIdCb)).toEqual(['a', 'b', 'c'])
})
