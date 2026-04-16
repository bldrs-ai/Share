import createStore from 'zustand/vanilla'
import createSourcesSlice from './SourcesSlice'


/** @return {object} vanilla store containing only SourcesSlice */
function makeStore() {
  return createStore((set, get) => createSourcesSlice(set, get))
}


describe('store/SourcesSlice', () => {
  describe('default state', () => {
    it('starts with an empty sources array, no active source, and idle browse state', () => {
      const state = makeStore().getState()
      expect(state.sources).toEqual([])
      expect(state.activeSourceId).toBeNull()
      expect(state.sourceBrowsePath).toBe('')
      expect(state.sourceFiles).toEqual([])
      expect(state.sourceFolders).toEqual([])
      expect(state.isSourceBrowsing).toBe(false)
    })
  })


  describe('addSource', () => {
    it('appends a source to the array', () => {
      const store = makeStore()
      store.getState().addSource({id: 'a', name: 'A'})
      store.getState().addSource({id: 'b', name: 'B'})
      expect(store.getState().sources).toEqual([
        {id: 'a', name: 'A'},
        {id: 'b', name: 'B'},
      ])
    })

    // TODO: addSource does not guard against duplicate ids — adding the
    // same id twice silently creates two entries. Refactor target: decide
    // whether dedupe should be enforced here or at the call site.
    it('allows duplicate ids (no uniqueness check)', () => {
      const store = makeStore()
      store.getState().addSource({id: 'dup', name: 'first'})
      store.getState().addSource({id: 'dup', name: 'second'})
      expect(store.getState().sources.length).toBe(2)
    })
  })


  describe('updateSource', () => {
    it('merges updates into the matching source by id', () => {
      const store = makeStore()
      store.getState().addSource({id: 'a', name: 'A', color: 'red'})
      store.getState().updateSource('a', {color: 'blue'})
      expect(store.getState().sources).toEqual([
        {id: 'a', name: 'A', color: 'blue'},
      ])
    })

    it('is a no-op for an unknown id', () => {
      const store = makeStore()
      store.getState().addSource({id: 'a', name: 'A'})
      store.getState().updateSource('zzz', {name: 'changed'})
      expect(store.getState().sources).toEqual([{id: 'a', name: 'A'}])
    })
  })


  describe('removeSource', () => {
    it('removes the matching source', () => {
      const store = makeStore()
      store.getState().addSource({id: 'a'})
      store.getState().addSource({id: 'b'})
      store.getState().removeSource('a')
      expect(store.getState().sources).toEqual([{id: 'b'}])
    })

    it('is a no-op for a non-existent id', () => {
      const store = makeStore()
      store.getState().addSource({id: 'a'})
      store.getState().removeSource('ghost')
      expect(store.getState().sources).toEqual([{id: 'a'}])
    })
  })


  describe('active source + browse state setters', () => {
    it('setActiveSourceId stores the id', () => {
      const store = makeStore()
      store.getState().setActiveSourceId('a')
      expect(store.getState().activeSourceId).toBe('a')
    })

    it('setSourceBrowsePath / setSourceFiles / setSourceFolders / setIsSourceBrowsing', () => {
      const store = makeStore()
      store.getState().setSourceBrowsePath('/folder')
      store.getState().setSourceFiles([{id: 'f1'}])
      store.getState().setSourceFolders([{id: 'd1'}])
      store.getState().setIsSourceBrowsing(true)

      const state = store.getState()
      expect(state.sourceBrowsePath).toBe('/folder')
      expect(state.sourceFiles).toEqual([{id: 'f1'}])
      expect(state.sourceFolders).toEqual([{id: 'd1'}])
      expect(state.isSourceBrowsing).toBe(true)
    })
  })
})
