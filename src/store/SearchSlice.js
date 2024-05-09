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
    setIsSearchEnabled: (is) => set(() => ({isSearchEnabled: is})),

    isSearchBarVisible: isVisibleInitially(),
    setIsSearchBarVisible: (is) => set(() => ({isSearchBarVisible: is})),

    searchIndex: new SearchIndex(),
    setSearchIndex: (index) => set(() => ({searchIndex: index})),
  }
}
