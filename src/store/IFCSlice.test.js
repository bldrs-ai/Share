import createStore from 'zustand/vanilla'
import createIFCSlice from './IFCSlice'


/** @return {object} vanilla store containing only IFCSlice */
function makeStore() {
  return createStore((set, get) => createIFCSlice(set, get))
}


describe('store/IFCSlice', () => {
  describe('default state', () => {
    it('starts with null refs for camera, model, viewSettings, root element', () => {
      const state = makeStore().getState()
      expect(state.cameraControls).toBeNull()
      expect(state.customViewSettings).toBeNull()
      expect(state.model).toBeNull()
      expect(state.loadedFileInfo).toBeNull()
      expect(state.preselectedElementIds).toBeNull()
      expect(state.rootElement).toBeNull()
    })

    it('starts with isModelLoading=false and isModelReady=false', () => {
      const state = makeStore().getState()
      expect(state.isModelLoading).toBe(false)
      expect(state.isModelReady).toBe(false)
    })

    it('starts with an empty elementTypesMap', () => {
      expect(makeStore().getState().elementTypesMap).toEqual([])
    })

    // TODO: IFCSlice defines `viewer: {}` but UISlice defines `viewer: null`
    // and the composed useStore spreads UISlice after IFCSlice, so UISlice's
    // null wins. In isolation here we still see the IFCSlice default. The
    // two slices both own "viewer" — the refactor should consolidate to one
    // owner and delete the dead initial value.
    it('exposes viewer initially as an empty object in isolation', () => {
      expect(makeStore().getState().viewer).toEqual({})
    })
  })


  describe('setters', () => {
    it('setCameraControls stores the camera controls', () => {
      const store = makeStore()
      const controls = {type: 'orbit'}
      store.getState().setCameraControls(controls)
      expect(store.getState().cameraControls).toBe(controls)
    })

    it('setCustomViewSettings stores the settings', () => {
      const store = makeStore()
      store.getState().setCustomViewSettings({foo: 'bar'})
      expect(store.getState().customViewSettings).toEqual({foo: 'bar'})
    })

    it('setIsModelLoading flips loading flag', () => {
      const store = makeStore()
      store.getState().setIsModelLoading(true)
      expect(store.getState().isModelLoading).toBe(true)
    })

    it('setIsModelReady flips ready flag', () => {
      const store = makeStore()
      store.getState().setIsModelReady(true)
      expect(store.getState().isModelReady).toBe(true)
    })

    it('setElementTypesMap replaces the array', () => {
      const store = makeStore()
      store.getState().setElementTypesMap([{name: 'Wall'}])
      expect(store.getState().elementTypesMap).toEqual([{name: 'Wall'}])
    })

    it('setLoadedFileInfo stores the file info', () => {
      const store = makeStore()
      const info = {source: 'github', path: 'model.ifc'}
      store.getState().setLoadedFileInfo(info)
      expect(store.getState().loadedFileInfo).toBe(info)
    })

    it('setModel stores the model reference', () => {
      const store = makeStore()
      const model = {castShadow: false}
      store.getState().setModel(model)
      expect(store.getState().model).toBe(model)
    })

    it('setPreselectedElementIds stores the ids', () => {
      const store = makeStore()
      store.getState().setPreselectedElementIds([1, 2, 3])
      expect(store.getState().preselectedElementIds).toEqual([1, 2, 3])
    })

    it('setRootElement stores the root', () => {
      const store = makeStore()
      const elt = {expressID: 1, type: 'IFCPROJECT'}
      store.getState().setRootElement(elt)
      expect(store.getState().rootElement).toBe(elt)
    })
  })


  describe('setViewerStore', () => {
    // TODO: setViewerStore writes to state.viewerStore, not state.viewer.
    // Nothing in the codebase reads state.viewerStore — it appears dead.
    // Meanwhile UISlice owns the canonical `viewer` slot via setViewer.
    // Refactor target: delete setViewerStore unless a reader materializes.
    it('writes to state.viewerStore and leaves state.viewer untouched', () => {
      const store = makeStore()
      const viewer = {GLTF: {GLTFModels: {}}}
      store.getState().setViewerStore(viewer)

      expect(store.getState().viewerStore).toBe(viewer)
      expect(store.getState().viewer).toEqual({}) // unchanged
    })
  })
})
