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
