import {isVisibleInitially} from '../Components/NavTree/hashState'


/**
 * NavTree store.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createNavTreeSlice(set, get) {
  return {
    isNavTreeEnabled: true,
    setNavTreeEnabled: (isEnabled) => set(() => ({isNavTreeEnabled: isEnabled})),

    defaultExpandedElements: [],
    setDefaultExpandedElements: (elts) => set(() => ({defaultExpandedElements: elts})),

    defaultExpandedTypes: [],
    setDefaultExpandedTypes: (types) => set(() => ({defaultExpandedTypes: types})),

    expandedElements: [],
    setExpandedElements: (elts) => set(() => ({expandedElements: elts})),

    expandedTypes: [],
    setExpandedTypes: (types) => set(() => ({expandedTypes: types})),

    isNavTreeVisible: isVisibleInitially(),
    setIsNavTreeVisible: (isVisible) => set(() => ({isNavTreeVisible: isVisible})),
    toggleIsNavTreeVisible: () =>
      set((state) => ({isNavTreeVisible: !state.isNavTreeVisible})),

    selectedElement: null,
    setSelectedElement: (elt) => set(() => ({selectedElement: elt})),

    selectedElements: [],
    setSelectedElements: (elts) => set(() => ({selectedElements: elts})),
  }
}
