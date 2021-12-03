import Testing from '@pablo-mayrgundter/testing.js/testing.js';
import {
  computeElementPath,
  setupLookupAndParentLinks
} from './TreeUtils.js';


const tests = new Testing();


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
        children: []
      }]
    }]
  };
}


tests.add('Test setupLookupAndParentLinks', () => {
  const tree = makeTestTree();
  const eltsById = {};
  setupLookupAndParentLinks(tree, eltsById);
  const a = tree;
  const b = tree.children[0];
  const c = tree.children[0].children[0];
  tests.assertEquals(b, c.parent);
  tests.assertEquals(a, b.parent);
  tests.assertEquals(undefined, a.parent);
  tests.assertEquals(a, eltsById[0]);
  tests.assertEquals(b, eltsById[1]);
  tests.assertEquals(c, eltsById[2]);
})

tests.add('Test computeElementPath', () => {
  const tree = makeTestTree();
  const a = tree;
  const b = tree.children[0];
  const c = tree.children[0].children[0];
  const getNameCb = elt => elt.name;
  tests.assertEquals('/a', computeElementPath(a, getNameCb));
  tests.assertEquals('/b', computeElementPath(b, getNameCb));
  tests.assertEquals('/c', computeElementPath(c, getNameCb));
  const eltsById = {};
  setupLookupAndParentLinks(tree, eltsById);
  tests.assertEquals('/a', computeElementPath(a, getNameCb));
  tests.assertEquals('/a/b', computeElementPath(b, getNameCb));
  tests.assertEquals('/a/b/c', computeElementPath(c, getNameCb));
})

tests.run();
