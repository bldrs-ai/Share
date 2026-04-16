import createStore from 'zustand/vanilla'
import createConnectionsSlice from './ConnectionsSlice'
import createSourcesSlice from './SourcesSlice'


/**
 * ConnectionsSlice's `removeConnection` reads `state.sources` to cascade
 * deletions, so its tests need a composed store that also contains
 * SourcesSlice. Tests that don't exercise the cascade can still use this
 * composed store safely — other slices are shadowed cleanly.
 *
 * @return {object} vanilla store with Connections + Sources slices
 */
function makeStore() {
  return createStore((set, get) => ({
    ...createSourcesSlice(set, get),
    ...createConnectionsSlice(set, get),
  }))
}


describe('store/ConnectionsSlice', () => {
  describe('default state', () => {
    it('starts with an empty connections array and no active connection', () => {
      const state = makeStore().getState()
      expect(state.connections).toEqual([])
      expect(state.activeConnectionId).toBeNull()
    })
  })


  describe('addConnection', () => {
    it('appends a connection', () => {
      const store = makeStore()
      store.getState().addConnection({id: 'gh', provider: 'github'})
      expect(store.getState().connections).toEqual([
        {id: 'gh', provider: 'github'},
      ])
    })

    it('preserves insertion order', () => {
      const store = makeStore()
      store.getState().addConnection({id: 'a'})
      store.getState().addConnection({id: 'b'})
      store.getState().addConnection({id: 'c'})
      expect(store.getState().connections.map((c) => c.id)).toEqual(['a', 'b', 'c'])
    })
  })


  describe('updateConnection', () => {
    it('merges updates into the matching connection', () => {
      const store = makeStore()
      store.getState().addConnection({id: 'gh', provider: 'github', user: 'old'})
      store.getState().updateConnection('gh', {user: 'new'})
      expect(store.getState().connections).toEqual([
        {id: 'gh', provider: 'github', user: 'new'},
      ])
    })

    it('is a no-op for an unknown id', () => {
      const store = makeStore()
      store.getState().addConnection({id: 'gh'})
      store.getState().updateConnection('nope', {user: 'x'})
      expect(store.getState().connections).toEqual([{id: 'gh'}])
    })
  })


  describe('removeConnection', () => {
    it('removes the matching connection', () => {
      const store = makeStore()
      store.getState().addConnection({id: 'gh'})
      store.getState().addConnection({id: 'gdrive'})
      store.getState().removeConnection('gh')
      expect(store.getState().connections).toEqual([{id: 'gdrive'}])
    })

    it('cascades to sources whose connectionId matches the removed connection', () => {
      const store = makeStore()
      store.getState().addConnection({id: 'gh'})
      store.getState().addConnection({id: 'gdrive'})
      store.getState().addSource({id: 's1', connectionId: 'gh'})
      store.getState().addSource({id: 's2', connectionId: 'gdrive'})
      store.getState().addSource({id: 's3', connectionId: 'gh'})

      store.getState().removeConnection('gh')

      expect(store.getState().connections).toEqual([{id: 'gdrive'}])
      expect(store.getState().sources).toEqual([
        {id: 's2', connectionId: 'gdrive'},
      ])
    })

    // TODO: removeConnection does NOT clear activeConnectionId if the
    // removed connection happened to be the active one. The UI could be
    // pointing at a ghost. Refactor target: either null it out here or
    // have consumers guard.
    it('does not clear activeConnectionId when the active connection is removed', () => {
      const store = makeStore()
      store.getState().addConnection({id: 'gh'})
      store.getState().setActiveConnectionId('gh')
      store.getState().removeConnection('gh')
      expect(store.getState().activeConnectionId).toBe('gh')
    })
  })


  describe('setActiveConnectionId', () => {
    it('stores the id', () => {
      const store = makeStore()
      store.getState().setActiveConnectionId('gh')
      expect(store.getState().activeConnectionId).toBe('gh')
    })
  })
})
