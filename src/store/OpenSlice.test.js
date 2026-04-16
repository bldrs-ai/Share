import createStore from 'zustand/vanilla'
import createOpenSlice from './OpenSlice'


/** @return {object} vanilla store containing only OpenSlice */
function makeStore() {
  return createStore((set, get) => createOpenSlice(set, get))
}


describe('store/OpenSlice', () => {
  describe('default state', () => {
    it('enables the Open feature by default', () => {
      expect(makeStore().getState().isOpenEnabled).toBe(true)
    })

    it('leaves the Open Model dialog hidden by default', () => {
      expect(makeStore().getState().isOpenModelVisible).toBe(false)
    })

    // TODO: default currentTab is 1 (not 0). Refactor target — the meaning
    // of tab indexes lives implicitly in component code; a named enum or
    // constant at the slice level would make this legible.
    it('defaults currentTab to 1', () => {
      expect(makeStore().getState().currentTab).toBe(1)
    })
  })


  describe('setters', () => {
    it('setIsOpenEnabled flips the flag', () => {
      const store = makeStore()
      store.getState().setIsOpenEnabled(false)
      expect(store.getState().isOpenEnabled).toBe(false)
    })

    it('setIsOpenModelVisible sets dialog visibility', () => {
      const store = makeStore()
      store.getState().setIsOpenModelVisible(true)
      expect(store.getState().isOpenModelVisible).toBe(true)
    })

    it('setCurrentTab stores the tab index', () => {
      const store = makeStore()
      store.getState().setCurrentTab(2)
      expect(store.getState().currentTab).toBe(2)
    })
  })
})
