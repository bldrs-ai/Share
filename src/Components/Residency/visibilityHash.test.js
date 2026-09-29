/* eslint-disable no-magic-numbers */
import {BufferGeometry, Group, Mesh, MeshBasicMaterial} from 'three'
import IfcIsolator from '../../viewer/three/IfcIsolator'
import {
  VISIBILITY_TERMS_MAX_CHARS,
  applyVisibilityHash,
  readVisibilityHash,
  visibilityRefs,
  writeVisibilityHash,
} from './visibilityHash'


jest.mock('../../viewer/ShareViewer', () => ({}))
jest.mock('postprocessing', () => ({
  BlendFunction: {SCREEN: 1},
}))
jest.mock('../../store/useStore', () => ({
  __esModule: true,
  default: {
    getState: jest.fn(() => ({elementTypesMap: [], selectedElements: []})),
    subscribe: jest.fn(),
    setState: jest.fn(),
  },
}))


/**
 * @param {string} [initial]
 * @return {object} a location double with a normalized `hash`
 */
function loc(initial = '') {
  let value = initial
  return {
    get hash() {
      return value
    },
    set hash(next) {
      value = next && !next.startsWith('#') ? `#${next}` : next
    },
  }
}


/**
 * A viewer around a real IfcIsolator, as IfcIsolator.test.js builds one.
 *
 * @return {object} viewer, with `.isolator`
 */
function makeViewer() {
  const context = {
    getScene: () => ({add: jest.fn(), remove: jest.fn()}),
    getPickableModels: () => [],
    getClippingPlanes: () => [],
    renderer: {update: jest.fn()},
    items: {pickableIfcModels: []},
  }
  const viewer = {
    postProcessor: {createOutlineEffect: jest.fn(() => ({setSelection: jest.fn()}))},
    setSelection: jest.fn(),
    setInstanceSelection: jest.fn(),
    getSelectedIds: jest.fn(() => []),
    highlighter: {setHighlighted: jest.fn()},
    _clearPreselectionForAllModels: jest.fn(),
    _clearConwaySelectionSubsets: jest.fn(),
  }
  viewer.isolator = new IfcIsolator(context, viewer)
  return viewer
}


/**
 * An ADF-shaped scene graph, named and tagged the way convertToShareModel
 * leaves one:
 *
 *   root 0 ─ Upper Jaw 1 ─┬─ facc 2 (loader-hidden)
 *                         └─ Tooth 3 ─ crown 4, Tooth 5 ─ crown 6
 *
 * @return {object} the root and its nodes by name
 */
function makeAdf() {
  const tag = (obj, id, name) => {
    obj.expressID = id
    obj.name = name
    if (id > 0) {
      obj.Name = {value: name}
    }
    return obj
  }
  const crown = (id) => tag(new Mesh(new BufferGeometry(), new MeshBasicMaterial()), id, 'crown')
  const root = tag(new Group(), 0, 'scene')
  const jaw = tag(new Group(), 1, 'Upper Jaw')
  const facc = tag(new Group(), 2, 'facc')
  facc.visible = false
  const tooth3 = tag(new Group(), 3, 'Tooth')
  const crown4 = crown(4)
  const tooth5 = tag(new Group(), 5, 'Tooth')
  const crown6 = crown(6)
  tooth3.add(crown4)
  tooth5.add(crown6)
  jaw.add(facc, tooth3, tooth5)
  root.add(jaw)
  const node = (obj) => ({expressID: obj.expressID, children: obj.children.map(node)})
  root.getSpatialStructure = () => Promise.resolve(node(root))
  return {root, facc, crown4, crown6}
}


/**
 * Load a fresh copy of the ADF into a fresh viewer, as a cold load does.
 *
 * @return {Promise<object>} `{viewer, ...makeAdf()}`
 */
async function loadAdf() {
  const viewer = makeViewer()
  const adf = makeAdf()
  await viewer.isolator.setModel(adf.root)
  return {viewer, ...adf}
}


describe('Components/Residency/visibilityHash', () => {
  describe('scene-graph (ADF) round trip', () => {
    it('writes nothing for the loader\'s defaults', async () => {
      const {viewer} = await loadAdf()
      const location = loc('#c:1,2,3,4,5,6')
      writeVisibilityHash(location, viewer)
      expect(location.hash).toBe('#c:1,2,3,4,5,6')
      expect(readVisibilityHash(location)).toBeNull()
    })

    it('writes a tooth hidden from its eye as its name path, and opens it hidden', async () => {
      const sender = await loadAdf()
      sender.viewer.isolator.hideElementsById(sender.viewer.isolator.flattenChildren(5))
      const location = loc('#c:1,2,3,4,5,6')
      writeVisibilityHash(location, sender.viewer)
      // Tooth 5 is the second `Tooth`; its crown follows it.
      expect(location.hash).toBe('#c:1,2,3,4,5,6;d:hide=nUpper%20Jaw/Tooth~2')

      const receiver = await loadAdf()
      expect(applyVisibilityHash(location, receiver.viewer, null)).toEqual([])
      expect(receiver.viewer.isolator.hiddenIds.sort()).toEqual([2, 5, 6])
      expect([receiver.crown4.visible, receiver.crown6.visible, receiver.facc.visible])
        .toEqual([true, false, false])
    })

    it('writes Show All as the default-hidden overlay shown', async () => {
      const sender = await loadAdf()
      sender.viewer.isolator.unHideAllElements()
      const location = loc()
      writeVisibilityHash(location, sender.viewer)
      expect(location.hash).toBe('#d:show=nUpper%20Jaw/facc')

      const receiver = await loadAdf()
      applyVisibilityHash(location, receiver.viewer, null)
      expect(receiver.viewer.isolator.hiddenIds).toEqual([])
      expect(receiver.facc.visible).toBe(true)
    })

    it('writes isolation, and opens isolated', async () => {
      const sender = await loadAdf()
      sender.viewer.getSelectedIds.mockReturnValue([4])
      sender.viewer.isolator.isolateSelectedElements()
      const location = loc()
      writeVisibilityHash(location, sender.viewer)
      expect(location.hash).toBe('#d:iso=nUpper%20Jaw/Tooth/crown')

      const receiver = await loadAdf()
      applyVisibilityHash(location, receiver.viewer, null)
      expect(receiver.viewer.isolator.tempIsolationModeOn).toBe(true)
      expect(receiver.viewer.isolator.isolatedIds).toEqual([4])
      expect([receiver.crown4.visible, receiver.crown6.visible]).toEqual([true, false])
      // Ending isolation brings back the defaults, not an all-shown model.
      receiver.viewer.isolator.resetTempIsolation()
      expect([receiver.crown6.visible, receiver.facc.visible]).toEqual([true, false])
    })

    it('keeps the display terms, and they keep it', async () => {
      const sender = await loadAdf()
      sender.viewer.isolator.hideElementsById(sender.viewer.isolator.flattenChildren(3))
      const location = loc('#d:color=src,wire=1')
      writeVisibilityHash(location, sender.viewer)
      expect(location.hash).toBe('#d:color=src,wire=1,hide=nUpper%20Jaw/Tooth')
      sender.viewer.isolator.unHideElementsById(sender.viewer.isolator.flattenChildren(3))
      writeVisibilityHash(location, sender.viewer)
      expect(location.hash).toBe('#d:color=src,wire=1')
    })

    it('leaves the model alone for a link without visibility terms', async () => {
      const {viewer, crown4} = await loadAdf()
      viewer.isolator.hideElementsById(viewer.isolator.flattenChildren(3))
      expect(applyVisibilityHash(loc('#d:color=src'), viewer, null)).toEqual([])
      expect(crown4.visible).toBe(false)
    })

    it('applies what resolves and returns what doesn\'t', async () => {
      const {viewer, crown4} = await loadAdf()
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
      const unresolved = applyVisibilityHash(
        loc('#d:hide=nUpper%20Jaw/Tooth+nLower%20Jaw+bogus+o12.34'), viewer, null)
      expect(unresolved).toEqual(['nLower%20Jaw', 'bogus', 'o12.34'])
      expect(crown4.visible).toBe(false)
      expect(warn).toHaveBeenCalledTimes(1)
      warn.mockRestore()
    })

    it('does nothing before the isolator has a model', () => {
      const viewer = makeViewer()
      const location = loc('#d:hide=e12')
      expect(writeVisibilityHash(location, viewer)).toBe(true)
      expect(location.hash).toBe('#d:hide=e12')
      expect(applyVisibilityHash(location, viewer, null)).toEqual([])
    })
  })


  describe('id-addressed models (IFC, STEP)', () => {
    /**
     * A stand-in isolator: `visibilityRefs` and `applyVisibilityHash` read
     * its state and call its methods, and the subset machinery a real one
     * drives for IFC is out of scope here.
     *
     * @param {object} [state]
     * @return {object} viewer
     */
    function stubViewer(state = {}) {
      const isolator = {
        ifcModel: {},
        _isSceneGraphModel: () => false,
        spatialStructure: {1: [2, 3], 2: [20, 21]},
        visualElementsIds: [20, 21, 3],
        defaultHiddenIds: [],
        hiddenIds: [],
        hiddenOccurrencePaths: new Map(),
        tempIsolationModeOn: false,
        isolatedIds: [],
        resetTempIsolation: jest.fn(),
        unHideAllElements: jest.fn(),
        hideElementsById: jest.fn(),
        hideOccurrence: jest.fn(),
        isolateElementsById: jest.fn(),
        ...state,
      }
      return {
        isolator,
        getInstanceIdsForOccurrencePath: jest.fn((modelId, path, {geometryExpressId}) =>
          (path.join('/') === '100/200' ? (geometryExpressId === 300 ? [7] : [7, 8]) : [])),
      }
    }

    it('writes element ids, hidden subtrees as their roots', () => {
      const viewer = stubViewer({hiddenIds: [2, 20, 21, 3], tempIsolationModeOn: true, isolatedIds: [20]})
      expect(visibilityRefs(viewer)).toEqual({hide: ['e2', 'e3'], show: [], iso: ['e20']})
      const location = loc()
      writeVisibilityHash(location, viewer)
      expect(location.hash).toBe('#d:hide=e2+e3,iso=e20')

      const receiver = stubViewer()
      applyVisibilityHash(location, receiver, null)
      expect(receiver.isolator.hideElementsById.mock.calls[0][0].sort()).toEqual([2, 20, 21, 3].sort())
      expect(receiver.isolator.isolateElementsById).toHaveBeenCalledWith([20])
    })

    it('skips element ids the model doesn\'t have, rather than isolating nothing', () => {
      const receiver = stubViewer()
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
      expect(applyVisibilityHash(loc('#d:hide=e3+e99,iso=e98'), receiver, null)).toEqual(['e99', 'e98'])
      expect(receiver.isolator.hideElementsById).toHaveBeenCalledWith([3])
      expect(receiver.isolator.isolateElementsById).not.toHaveBeenCalled()
      warn.mockRestore()
    })

    it('writes a STEP occurrence as its path, and hides it by that path', () => {
      const occurrence = {occurrencePath: [100, 200], solidExpressId: 300}
      const viewer = stubViewer({hiddenOccurrencePaths: new Map([[300, occurrence]])})
      expect(visibilityRefs(viewer).hide).toEqual(['o100.200.300'])
      const location = loc()
      writeVisibilityHash(location, viewer)

      const receiver = stubViewer()
      const rootElement = {
        expressID: 1,
        children: [{
          expressID: 100, occurrencePath: [100], children: [{
            expressID: 200, occurrencePath: [100, 200], children: [
              {expressID: 300, occurrencePath: [100, 200], ephemeral: true, children: []},
            ],
          }],
        }],
      }
      expect(applyVisibilityHash(location, receiver, rootElement)).toEqual([])
      expect(receiver.isolator.hideElementsById).not.toHaveBeenCalled()
      expect(receiver.isolator.hideOccurrence).toHaveBeenCalledWith(300, [7], occurrence)
    })

    it('leaves the state out of the link past the size cap', () => {
      const many = Array.from({length: VISIBILITY_TERMS_MAX_CHARS}, (_, i) => 1000 + i)
      const viewer = stubViewer({hiddenIds: many, visualElementsIds: many})
      const location = loc('#d:color=src,hide=e1')
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
      expect(writeVisibilityHash(location, viewer)).toBe(false)
      expect(location.hash).toBe('#d:color=src')
      warn.mockRestore()
    })
  })
})
