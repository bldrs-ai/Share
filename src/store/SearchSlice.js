import SearchIndex from '../search/SearchIndex'
import {isVisibleInitially} from '../Components/Search/hashState'


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

    isSearchBarVisible: isVisibleInitially(),
    setIsSearchBarVisible: (isVisible) => set(() => ({isSearchBarVisible: isVisible})),

    searchIndex: new SearchIndex(),
    setSearchIndex: (index) => set(() => ({searchIndex: index})),
  }
}
