import {isVisibleInitially as openModelIsVisibleInitially} from '../Components/Open/hashState'


/**
 * Open/Save Controls store.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createOpenSlice(set, get) {
  return {
    isOpenEnabled: true,
    setIsOpenEnabled: (is) => set(() => ({isOpenEnabled: is})),

    isOpenModelVisible: openModelIsVisibleInitially(),
    setIsOpenModelVisible: (is) => set(() => ({isOpenModelVisible: is})),

    currentTab: 1,
    setCurrentTab: (currentTab) => set(() => ({currentTab: currentTab})),
  }
}
