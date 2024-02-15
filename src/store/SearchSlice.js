import SearchIndex from '../search/SearchIndex'


/**
 * Search store.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createSearchSlice(set, get) {
  return {
    isSearchEnabled: true,
    setIsSearchEnabled: (isEnabled) => set(() => ({isSearchEnabled: isEnabled})),

    isSearchBarVisible: false,
    setIsSearchBarVisible: (isVisible) => set(() => ({isSearchBarVisible: isVisible})),
    toggleIsSearchBarVisible: () => set((state) =>
      ({isSearchBarVisible: !state.isSearchBarVisible})),

    searchIndex: new SearchIndex(),
    setSearchIndex: (index) => set(() => ({searchIndex: index})),

  }
}
