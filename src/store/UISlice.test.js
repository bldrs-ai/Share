/* eslint-disable no-magic-numbers */
import createStore from 'zustand/vanilla'
import createUISlice from './UISlice'


/** @return {object} vanilla store containing only UISlice */
function makeStore() {
  return createStore((set, get) => createUISlice(set, get))
}


describe('store/UISlice', () => {
  describe('default state', () => {
    it('starts with no alert or snack message', () => {
      const state = makeStore().getState()
      expect(state.alert).toBeNull()
      expect(state.snackMessage).toBeNull()
    })

    it('starts with hash-controlled panels hidden (except About, which is gated on isFirst)', () => {
      const state = makeStore().getState()
      // isAboutVisible is isFirst() || hasParams('about'), so it can
      // default to true in a clean jest env — see Components/About/hashState.js.
      expect(typeof state.isAboutVisible).toBe('boolean')
      expect(state.isHelpVisible).toBe(false)
      expect(state.isImagineVisible).toBe(false)
      expect(state.isLoginVisible).toBe(false)
      expect(state.isShareVisible).toBe(false)
    })

    it('starts with help tooltips and save dialog hidden', () => {
      const state = makeStore().getState()
      expect(state.isHelpTooltipsVisible).toBe(false)
      expect(state.isSaveModelVisible).toBe(false)
    })

    it('starts with null viewer and levelInstance', () => {
      const state = makeStore().getState()
      expect(state.viewer).toBeNull()
      expect(state.levelInstance).toBeNull()
    })

    it('seeds vh from window.innerHeight at slice-creation time', () => {
      expect(makeStore().getState().vh).toBe(window.innerHeight)
    })
  })


  describe('panel visibility setters', () => {
    it.each([
      ['setIsAboutVisible', 'isAboutVisible'],
      ['setIsHelpVisible', 'isHelpVisible'],
      ['setIsHelpTooltipsVisible', 'isHelpTooltipsVisible'],
      ['setIsImagineVisible', 'isImagineVisible'],
      ['setIsLoginVisible', 'isLoginVisible'],
      ['setIsSaveModelVisible', 'isSaveModelVisible'],
      ['setIsShareVisible', 'isShareVisible'],
    ])('%s flips %s', (setterName, key) => {
      const store = makeStore()
      store.getState()[setterName](true)
      expect(store.getState()[key]).toBe(true)
      store.getState()[setterName](false)
      expect(store.getState()[key]).toBe(false)
    })
  })


  describe('theme', () => {
    // TODO: isThemeEnabled is pulled directly from process.env at module
    // load with no coercion — same pattern as AppsSlice. Refactor target:
    // central env-var parsing.
    it('exposes isThemeEnabled and a setter', () => {
      const store = makeStore()
      expect(store.getState()).toHaveProperty('isThemeEnabled')
      store.getState().setIsThemeEnabled(true)
      expect(store.getState().isThemeEnabled).toBe(true)
    })
  })


  describe('misc setters', () => {
    it('setAlert stores the alert object', () => {
      const store = makeStore()
      const alert = {severity: 'error', message: 'boom'}
      store.getState().setAlert(alert)
      expect(store.getState().alert).toBe(alert)
    })

    it('setSnackMessage stores the snack message', () => {
      const store = makeStore()
      store.getState().setSnackMessage(['loading'])
      expect(store.getState().snackMessage).toEqual(['loading'])
    })

    it('setLevelInstance stores the plane height bottom', () => {
      const store = makeStore()
      store.getState().setLevelInstance(42)
      expect(store.getState().levelInstance).toBe(42)
    })

    it('setViewer stores the viewer reference', () => {
      const store = makeStore()
      const viewer = {GLTF: {GLTFModels: {}}}
      store.getState().setViewer(viewer)
      expect(store.getState().viewer).toBe(viewer)
    })

    it('setVh stores a new viewport height', () => {
      const store = makeStore()
      store.getState().setVh(1000)
      expect(store.getState().vh).toBe(1000)
    })
  })
})
