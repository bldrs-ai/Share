import {
  computeElementPath,
  setupLookupAndParentLinks,
} from './TreeUtils'

/**
 *Helper to create a mock IFC doc object tree.
 *@return {Object} The mock IFC obj.
 *
 */
function makeTestTree() {
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


test('Test computeElementPath', () => {
  const tree = makeTestTree()
  const a = tree
  const b = tree.children[0]
  const c = tree.children[0].children[0]
  const getNameCb = (elt) => elt.name
  expect('/a').toEqual(computeElementPath(a, getNameCb))
  expect('/b').toEqual(computeElementPath(b, getNameCb))
  expect('/c').toEqual(computeElementPath(c, getNameCb))
  const eltsById = {}
  setupLookupAndParentLinks(tree, eltsById)
  expect('/a').toEqual(computeElementPath(a, getNameCb))
  expect('/a/b').toEqual(computeElementPath(b, getNameCb))
  expect('/a/b/c').toEqual(computeElementPath(c, getNameCb))
})
