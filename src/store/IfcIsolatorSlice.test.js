import createStore from 'zustand/vanilla'
import createIsolatorSlice from './IfcIsolatorSlice'


/** @return {object} vanilla store containing only IfcIsolatorSlice */
function makeStore() {
  return createStore((set, get) => createIsolatorSlice(set, get))
}


describe('store/IfcIsolatorSlice', () => {
  describe('default state', () => {
    it('starts with empty hidden/isolated maps and temp isolation off', () => {
      const state = makeStore().getState()
      expect(state.hiddenElements).toEqual({})
      expect(state.isolatedElements).toEqual({})
      expect(state.isTempIsolationModeOn).toBe(false)
    })
  })


  // Hidden state belongs to one model path (CadView#onViewer claims it).
  describe('claimHiddenElementsForModel', () => {
    it('drops hidden state and the seeding flag left by a different model', () => {
      const store = makeStore()
      store.setState({hiddenElements: {5: true}, hiddenElementsModelPath: '/a.obj', sceneGraphDefaultsSeeded: true})
      store.getState().claimHiddenElementsForModel('/b.obj')
      expect(store.getState()).toMatchObject({
        hiddenElements: {}, hiddenElementsModelPath: '/b.obj', sceneGraphDefaultsSeeded: false,
      })
    })

    it('keeps them for the same model, which a viewer re-init reloads', () => {
      const store = makeStore()
      store.setState({hiddenElements: {5: true}, hiddenElementsModelPath: '/a.obj', sceneGraphDefaultsSeeded: true})
      store.getState().claimHiddenElementsForModel('/a.obj')
      expect(store.getState()).toMatchObject({
        hiddenElements: {5: true}, hiddenElementsModelPath: '/a.obj', sceneGraphDefaultsSeeded: true,
      })
    })

    it('claims the first model loaded', () => {
      const store = makeStore()
      store.getState().claimHiddenElementsForModel('/a.obj')
      expect(store.getState().hiddenElementsModelPath).toBe('/a.obj')
    })
  })


  describe('updateHiddenStatus', () => {
    it('merges a single id without clobbering others', () => {
      const store = makeStore()
      store.getState().updateHiddenStatus('10', true)
      store.getState().updateHiddenStatus('20', true)
      expect(store.getState().hiddenElements).toEqual({10: true, 20: true})
    })

    it('can flip an id back to false', () => {
      const store = makeStore()
      store.getState().updateHiddenStatus('10', true)
      store.getState().updateHiddenStatus('10', false)
      expect(store.getState().hiddenElements).toEqual({10: false})
    })
  })


  describe('updateIsolatedStatus', () => {
    it('merges a single id without clobbering others', () => {
      const store = makeStore()
      store.getState().updateIsolatedStatus('1', true)
      store.getState().updateIsolatedStatus('2', false)
      expect(store.getState().isolatedElements).toEqual({1: true, 2: false})
    })
  })


  describe('setHiddenElements / setIsolatedElements', () => {
    it('setHiddenElements replaces the entire map', () => {
      const store = makeStore()
      store.getState().updateHiddenStatus('10', true)
      store.getState().setHiddenElements({99: true})
      expect(store.getState().hiddenElements).toEqual({99: true})
    })

    it('setIsolatedElements replaces the entire map', () => {
      const store = makeStore()
      store.getState().updateIsolatedStatus('1', true)
      store.getState().setIsolatedElements({5: true})
      expect(store.getState().isolatedElements).toEqual({5: true})
    })
  })


  describe('setIsTempIsolationModeOn', () => {
    it('flips temp isolation mode', () => {
      const store = makeStore()
      store.getState().setIsTempIsolationModeOn(true)
      expect(store.getState().isTempIsolationModeOn).toBe(true)
      store.getState().setIsTempIsolationModeOn(false)
      expect(store.getState().isTempIsolationModeOn).toBe(false)
    })
  })
})
