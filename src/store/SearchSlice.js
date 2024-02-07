import SearchIndex from '../search/SearchIndex'


/**
 * Search store.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function SearchSlice(set, get) {
  return {
    isSearchEnabled: true,
    isSearchBarVisible: false,
    searchIndex: new SearchIndex(),
    setIsSearchEnabled: (isEnabled) => set(() => ({isSearchEnabled: isEnabled})),
    setIsSearchBarVisible: (isVisible) => set(() => ({isSearchBarVisible: isVisible})),
    setSearchIndex: (index) => set(() => ({searchIndex: index})),
    toggleIsSearchBarVisible: () => set((state) => ({isSearchBarVisible: !state.isSearchBarVisible})),
  }
}
