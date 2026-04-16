import createStore from 'zustand/vanilla'
import createVersionsSlice from './VersionsSlice'


/** @return {object} vanilla store containing only VersionsSlice */
function makeStore() {
  return createStore((set, get) => createVersionsSlice(set, get))
}


describe('store/VersionsSlice', () => {
  describe('default state', () => {
    it('is disabled and hidden, with no active version', () => {
      const state = makeStore().getState()
      expect(state.isVersionsEnabled).toBe(false)
      expect(state.isVersionsVisible).toBe(false)
      expect(state.activeVersion).toBe(0)
      expect(state.versions).toEqual({})
    })
  })


  describe('enable / visibility', () => {
    it('setIsVersionsEnabled turns the feature on', () => {
      const store = makeStore()
      store.getState().setIsVersionsEnabled(true)
      expect(store.getState().isVersionsEnabled).toBe(true)
    })

    it('setIsVersionsVisible sets visibility', () => {
      const store = makeStore()
      store.getState().setIsVersionsVisible(true)
      expect(store.getState().isVersionsVisible).toBe(true)
    })

    it('toggleIsVersionsVisible flips visibility', () => {
      const store = makeStore()
      expect(store.getState().isVersionsVisible).toBe(false)
      store.getState().toggleIsVersionsVisible()
      expect(store.getState().isVersionsVisible).toBe(true)
      store.getState().toggleIsVersionsVisible()
      expect(store.getState().isVersionsVisible).toBe(false)
    })
  })


  describe('active version', () => {
    it('setActiveVersion stores the version index', () => {
      const store = makeStore()
      store.getState().setActiveVersion(7)
      expect(store.getState().activeVersion).toBe(7)
    })
  })


  describe('versions map', () => {
    it('setVersions replaces the entire map', () => {
      const store = makeStore()
      const commits = {
        abc123: {sha: 'abc123', message: 'first'},
        def456: {sha: 'def456', message: 'second'},
      }
      store.getState().setVersions(commits)
      expect(store.getState().versions).toEqual(commits)
    })

    it('setVersions can clear the map', () => {
      const store = makeStore()
      store.getState().setVersions({a: 1})
      store.getState().setVersions({})
      expect(store.getState().versions).toEqual({})
    })
  })
})
