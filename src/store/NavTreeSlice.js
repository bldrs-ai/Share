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

    // Synthetic IfcInstanceMap instance IDs (one per Conway
    // PlacedGeometry). Populated alongside `selectedElements` on the
    // Conway-direct path (`?feature=conwayDirectIfc`) when the user
    // clicks a specific visible placement of an IfcMappedItem-style
    // shared shape: `selectedElements` still carries the parent IFC
    // expressID so the properties panel / nav tree / search behave
    // normally, but the highlight is restricted to just the clicked
    // instance's triangles. Empty when the per-instance map is not
    // available (today's web-ifc-three path) or when Shift-click
    // selects the whole IFC element.
    selectedInstanceIds: [],
    setSelectedInstanceIds: (ids) => set(() => ({selectedInstanceIds: ids})),

    // STEP occurrence path (NAUO express ids) of the selected occurrence, or
    // null. A reused part's occurrences share one `selectedElements` expressID,
    // so this is what lets the NavTree highlight the one clicked/picked node
    // instead of every reuse. Null for IFC and single-occurrence parts.
    selectedOccurrencePath: null,
    setSelectedOccurrencePath: (path) => set(() => ({selectedOccurrencePath: path})),
  }
}
