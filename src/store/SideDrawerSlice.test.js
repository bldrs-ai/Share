/* eslint-disable no-magic-numbers */
import createStore from 'zustand/vanilla'
import createSideDrawerSlice from './SideDrawerSlice'


/** @return {object} vanilla store containing only SideDrawerSlice */
function makeStore() {
  return createStore((set, get) => createSideDrawerSlice(set, get))
}


describe('store/SideDrawerSlice', () => {
  describe('default state', () => {
    it('enables the side drawer', () => {
      expect(makeStore().getState().isSideDrawerEnabled).toBe(true)
    })

    it('seeds the three drawer widths and the height from the module constants', () => {
      const state = makeStore().getState()
      expect(state.leftDrawerWidth).toBe(370)
      expect(state.rightDrawerWidth).toBe(370)
      expect(state.appsDrawerWidth).toBe(370)
      expect(state.leftDrawerWidthInitial).toBe(370)
      expect(state.rightDrawerWidthInitial).toBe(370)
      expect(state.appsDrawerWidthInitial).toBe(370)
      expect(state.drawerWidthInitial).toBe(370)
      expect(state.drawerHeight).toBe('50vh')
      expect(state.drawerHeightInitial).toBe('50vh')
    })
  })


  describe('setters', () => {
    it('setIsSideDrawerEnabled flips the flag', () => {
      const store = makeStore()
      store.getState().setIsSideDrawerEnabled(false)
      expect(store.getState().isSideDrawerEnabled).toBe(false)
    })

    it.each([
      ['setLeftDrawerWidth', 'leftDrawerWidth', 500],
      ['setRightDrawerWidth', 'rightDrawerWidth', 420],
      ['setAppsDrawerWidth', 'appsDrawerWidth', 600],
    ])('%s updates %s', (setterName, key, newValue) => {
      const store = makeStore()
      store.getState()[setterName](newValue)
      expect(store.getState()[key]).toBe(newValue)
    })

    it('setDrawerHeight stores the new height', () => {
      const store = makeStore()
      store.getState().setDrawerHeight('80vh')
      expect(store.getState().drawerHeight).toBe('80vh')
    })

    // TODO: setDrawerHeightInitial is present and documented as "just for
    // test setup" — it mutates a value the slice explicitly says to "leave
    // constant". Refactor target: move the initial values out of store
    // state entirely (they're module constants), which removes both the
    // setter and the comment.
    it('setDrawerHeightInitial mutates drawerHeightInitial even though docs say not to', () => {
      const store = makeStore()
      store.getState().setDrawerHeightInitial('90vh')
      expect(store.getState().drawerHeightInitial).toBe('90vh')
    })
  })
})
