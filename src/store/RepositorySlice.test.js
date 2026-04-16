import createStore from 'zustand/vanilla'
import createRepositorySlice from './RepositorySlice'


/** @return {object} vanilla store containing only RepositorySlice */
function makeStore() {
  return createStore((set, get) => createRepositorySlice(set, get))
}


describe('store/RepositorySlice', () => {
  describe('default state', () => {
    it('starts with empty access token, no identity, and no repository', () => {
      const state = makeStore().getState()
      expect(state.accessToken).toBe('')
      expect(state.hasGithubIdentity).toBe(false)
      expect(state.repository).toBeNull()
      expect(state.modelPath).toBeNull()
      expect(state.appMetadata).toEqual({})
      expect(state.branches).toEqual([])
    })
  })


  describe('setRepository', () => {
    it('stores the org/repo pair when both are provided', () => {
      const store = makeStore()
      store.getState().setRepository('bldrs-ai', 'Share')
      expect(store.getState().repository).toEqual({orgName: 'bldrs-ai', name: 'Share'})
    })

    it('clears back to null when called with no args', () => {
      const store = makeStore()
      store.getState().setRepository('bldrs-ai', 'Share')
      store.getState().setRepository()
      expect(store.getState().repository).toBeNull()
    })

    it('clears to null if either org or repo is falsy', () => {
      const store = makeStore()
      store.getState().setRepository('bldrs-ai', 'Share')

      store.getState().setRepository('', 'Share')
      expect(store.getState().repository).toBeNull()

      store.getState().setRepository('bldrs-ai', '')
      expect(store.getState().repository).toBeNull()
    })
  })


  describe('setAccessToken / setHasGithubIdentity', () => {
    it('setAccessToken stores the token', () => {
      const store = makeStore()
      store.getState().setAccessToken('gho_abc123')
      expect(store.getState().accessToken).toBe('gho_abc123')
    })

    it('setHasGithubIdentity flips the flag', () => {
      const store = makeStore()
      store.getState().setHasGithubIdentity(true)
      expect(store.getState().hasGithubIdentity).toBe(true)
    })
  })


  describe('misc setters', () => {
    it('setAppMetadata replaces the metadata object', () => {
      const store = makeStore()
      store.getState().setAppMetadata({version: '1.0'})
      expect(store.getState().appMetadata).toEqual({version: '1.0'})
    })

    it('setModelPath stores the model path', () => {
      const store = makeStore()
      const path = {org: 'bldrs-ai', repo: 'Share', branch: 'main', filepath: 'model.ifc'}
      store.getState().setModelPath(path)
      expect(store.getState().modelPath).toBe(path)
    })
  })


  describe('setBranches', () => {
    // TODO: setBranches writes to state.issues rather than state.branches —
    // almost certainly a typo at RepositorySlice.js:21. Captured here so
    // the refactor has an explicit marker. Fixing this needs a grep for
    // any reader of state.issues to make sure nothing depends on the bug.
    it('writes the passed-in array under state.issues (not state.branches)', () => {
      const store = makeStore()
      store.getState().setBranches(['main', 'dev'])
      expect(store.getState().issues).toEqual(['main', 'dev'])
      expect(store.getState().branches).toEqual([])
    })
  })
})
