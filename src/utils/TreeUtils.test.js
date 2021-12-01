import Testing from '@pablo-mayrgundter/testing.js/testing.js';
import {
  computeElementPath,
  setupParentLinks
} from './TreeUtils';


const tests = new Testing();


function makeTestTree() {
  return {
    name: 'a',
    children: [{
      name: 'b',
      children: [{
        name: 'c',
        children: []
      }]
    }]
  };
}


tests.add('Test setupParentLinks', () => {
  const tree = makeTestTree();
  setupParentLinks(tree);
  const a = tree;
  const b = tree.children[0];
  const c = tree.children[0].children[0];
  tests.assertEquals(b, c.parent);
  tests.assertEquals(a, b.parent);
  tests.assertEquals(undefined, a.parent);
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
  setupParentLinks(tree);
  tests.assertEquals('/a', computeElementPath(a, getNameCb));
  tests.assertEquals('/a/b', computeElementPath(b, getNameCb));
  tests.assertEquals('/a/b/c', computeElementPath(c, getNameCb));
})

tests.run();
