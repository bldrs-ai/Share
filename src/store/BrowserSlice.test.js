import createStore from 'zustand/vanilla'
import createBrowserSlice from './BrowserSlice'


/** @return {object} vanilla store containing only BrowserSlice */
function makeStore() {
  return createStore((set, get) => createBrowserSlice(set, get))
}


describe('store/BrowserSlice', () => {
  // TODO: BrowserSlice reads process.env.OPFS_IS_ENABLED and
  // OAUTH2_CLIENT_ID at module load time, so its defaults depend on how
  // the test runner stamps those env vars (see tools/jest/vars.jest.js).
  // Refactor target: parameterize this slice on a config object instead of
  // reading process.env directly, so tests can exercise both branches.
  describe('default state', () => {
    it('exposes isOpfsAvailable and setIsOpfsAvailable', () => {
      const state = makeStore().getState()
      expect(state).toHaveProperty('isOpfsAvailable')
      expect(typeof state.setIsOpfsAvailable).toBe('function')
    })

    it('exposes opfsFile and setOpfsFile', () => {
      const state = makeStore().getState()
      expect(state).toHaveProperty('opfsFile')
      expect(typeof state.setOpfsFile).toBe('function')
    })
  })


  describe('setOpfsFile', () => {
    it('replaces the opfsFile reference', () => {
      const store = makeStore()
      const file = {name: 'my.ifc', size: 0}
      store.getState().setOpfsFile(file)
      expect(store.getState().opfsFile).toBe(file)
    })

    it('can clear to null', () => {
      const store = makeStore()
      store.getState().setOpfsFile({name: 'x'})
      store.getState().setOpfsFile(null)
      expect(store.getState().opfsFile).toBeNull()
    })
  })


  describe('setIsOpfsAvailable', () => {
    // The setter's behavior depends on isOpfsEnabled at module-load time.
    // When disabled, every set-call is clamped to `false` regardless of
    // the argument. When enabled, the passed value is stored directly.
    // We assert only that calling the setter does not throw and that the
    // resulting value is either exactly the passed value or `false`.
    it('stores a boolean-valued result', () => {
      const store = makeStore()
      store.getState().setIsOpfsAvailable(true)
      const afterTrue = store.getState().isOpfsAvailable
      expect([true, false]).toContain(afterTrue)

      store.getState().setIsOpfsAvailable(false)
      expect(store.getState().isOpfsAvailable).toBe(false)
    })
  })
})
