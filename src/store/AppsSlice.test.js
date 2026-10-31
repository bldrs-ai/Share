import createStore from 'zustand/vanilla'
import createAppsSlice from './AppsSlice'


/** @return {object} vanilla store containing only AppsSlice */
function makeStore() {
  return createStore((set, get) => createAppsSlice(set, get))
}


describe('store/AppsSlice', () => {
  describe('default state', () => {
    // TODO: isAppsEnabled is pulled directly from process.env.APPS_IS_ENABLED
    // at module load time without any parsing — strings like 'false' would
    // read as truthy. Refactor target: coerce to a real boolean (and do it
    // once, in a central env-var loader).
    it('exposes isAppsEnabled from process.env.APPS_IS_ENABLED', () => {
      expect(makeStore().getState()).toHaveProperty('isAppsEnabled')
    })

    it('starts with the apps panel hidden and no selected app', () => {
      const state = makeStore().getState()
      expect(state.isAppsVisible).toBe(false)
      expect(state.selectedApp).toBeNull()
    })
  })


  // #1993: the workspace Apps bar docks apps opened this session and
  // apps the user pinned.
  describe('running and pinned apps', () => {
    beforeEach(() => localStorage.clear())

    it('marks a selected app running, once, and keeps it after deselecting', () => {
      const store = makeStore()
      const app = {appName: 'Calc'}
      store.getState().setSelectedApp(app)
      store.getState().setSelectedApp(app)
      store.getState().setSelectedApp(null)
      expect(store.getState().runningApps).toEqual([app])
    })

    it('closes a running app, returning the drawer to the listing if it was showing', () => {
      const store = makeStore()
      store.getState().setSelectedApp({appName: 'Calc'})
      store.getState().closeRunningApp('Calc')
      expect(store.getState().runningApps).toEqual([])
      expect(store.getState().selectedApp).toBeNull()
    })

    it('toggles a pin and persists it for the next load', () => {
      const store = makeStore()
      store.getState().togglePinnedApp('Calc')
      expect(store.getState().pinnedAppNames).toEqual(['Calc'])
      expect(makeStore().getState().pinnedAppNames).toEqual(['Calc'])
      store.getState().togglePinnedApp('Calc')
      expect(makeStore().getState().pinnedAppNames).toEqual([])
    })
  })


  describe('setters', () => {
    it('setIsAppsVisible sets visibility', () => {
      const store = makeStore()
      store.getState().setIsAppsVisible(true)
      expect(store.getState().isAppsVisible).toBe(true)
    })

    it('setSelectedApp stores the app descriptor', () => {
      const store = makeStore()
      const app = {id: 'app-1', name: 'Test App'}
      store.getState().setSelectedApp(app)
      expect(store.getState().selectedApp).toBe(app)
    })

    it('setSelectedApp can clear to null', () => {
      const store = makeStore()
      store.getState().setSelectedApp({id: 'app-1'})
      store.getState().setSelectedApp(null)
      expect(store.getState().selectedApp).toBeNull()
    })

    // TODO: there is no setIsAppsEnabled — the flag is immutable from
    // within the store. If feature-flag toggling is ever needed at runtime
    // (e.g. in tests), add a setter.
    it('does not expose a setIsAppsEnabled setter', () => {
      expect(makeStore().getState().setIsAppsEnabled).toBeUndefined()
    })
  })
})
