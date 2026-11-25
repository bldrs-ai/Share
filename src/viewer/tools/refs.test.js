/* eslint-disable no-magic-numbers */
import {Group} from 'three'
import * as visibilityRefs from '../../model/visibilityRefs'
import {refMaker, resolveRefs} from './refs'


/**
 * @param {string} name
 * @return {object} a scene-graph model of two named, tagged nodes
 */
function makeModel(name) {
  const model = new Group()
  model.name = name
  ;[1, 2].forEach((id) => {
    const node = new Group()
    node.name = `part${id}`
    node.expressID = id
    model.add(node)
  })
  return model
}


/**
 * @param {object} model
 * @return {object} a viewer whose isolator holds the model as a scene graph
 */
function viewerOf(model) {
  return {isolator: {ifcModel: model, visualElementsIds: [1, 2], _isSceneGraphModel: () => true}}
}


describe('viewer/tools/refs name-path index', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  // #1673: every chip resolves and canonicalizes; each used to rebuild the
  // index with a full traversal of the model.
  it('builds the index once per model, however many refs resolve against it', () => {
    const build = jest.spyOn(visibilityRefs, 'sceneGraphNamePaths')
    const viewer = viewerOf(makeModel('a'))
    const state = {viewer, rootElement: {expressID: 0, children: []}}
    for (let i = 0; i < 25; i++) {
      resolveRefs(['npart1', 'npart2'], state)
      refMaker(viewer)(1)
    }
    expect(build).toHaveBeenCalledTimes(1)
    expect(resolveRefs(['npart2'], state).targets).toEqual([{ref: 'npart2', kind: 'id', id: 2}])
  })

  it('rebuilds it when the model is replaced', () => {
    const build = jest.spyOn(visibilityRefs, 'sceneGraphNamePaths')
    const first = viewerOf(makeModel('a'))
    const second = viewerOf(makeModel('b'))
    refMaker(first)(1)
    refMaker(second)(1)
    refMaker(first)(2)
    expect(build).toHaveBeenCalledTimes(2)
  })
})
