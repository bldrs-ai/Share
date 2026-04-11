import createStore from 'zustand/vanilla'
import SearchIndex from '../search/SearchIndex'
import createSearchSlice from './SearchSlice'


/** @return {object} vanilla store containing only SearchSlice */
function makeStore() {
  return createStore((set, get) => createSearchSlice(set, get))
}


describe('store/SearchSlice', () => {
  describe('default state', () => {
    it('enables search by default', () => {
      expect(makeStore().getState().isSearchEnabled).toBe(true)
    })

    it('leaves the search bar hidden by default (no hash)', () => {
      expect(makeStore().getState().isSearchBarVisible).toBe(false)
    })

    it('seeds the store with a real SearchIndex instance', () => {
      expect(makeStore().getState().searchIndex).toBeInstanceOf(SearchIndex)
    })
  })


  describe('setters', () => {
    it('setIsSearchEnabled flips the flag', () => {
      const store = makeStore()
      store.getState().setIsSearchEnabled(false)
      expect(store.getState().isSearchEnabled).toBe(false)
    })

    it('setIsSearchBarVisible sets visibility', () => {
      const store = makeStore()
      store.getState().setIsSearchBarVisible(true)
      expect(store.getState().isSearchBarVisible).toBe(true)
    })

    it('setSearchIndex swaps the index reference', () => {
      const store = makeStore()
      const replacement = new SearchIndex()
      store.getState().setSearchIndex(replacement)
      expect(store.getState().searchIndex).toBe(replacement)
    })
  })
})
