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

    // Express id of the selected ephemeral solid (a multibody STEP part's
    // named body — the NavTree's `type:'solid'` nodes), or null when the
    // selection is a whole product/occurrence. Solid nodes share their
    // parent's occurrence path, so the path alone can't say whether the
    // selection is the part or one body inside it — this is the second half
    // of the (occurrencePath, solid expressID) identity. Consumers: NavTree
    // row highlight/scroll, per-solid hide (H), permalink round-trip.
    selectedSolidExpressId: null,
    setSelectedSolidExpressId: (id) => set(() => ({selectedSolidExpressId: id})),

    // Transient NavTree rows for anonymous below-product geometry
    // (conway#387): parent occurrence-path key → [{expressID, label}].
    // Session-only by design — rows materialize from a scene pick, a
    // permalink, or a "N more…" expansion and are reconstructed on the fly;
    // they are never persisted to the GLB cache, so a reload only recreates
    // the one a permalink names. Keyed additively with per-id dedup because
    // the same piece can arrive from several sources (pick then permalink).
    transientTreeNodes: {},
    addTransientTreeNodes: (pathKey, nodes) => set((state) => {
      const existing = state.transientTreeNodes[pathKey] ?? []
      const known = new Set(existing.map((node) => node.expressID))
      const fresh = nodes.filter((node) => !known.has(node.expressID))
      if (fresh.length === 0) {
        return {}
      }
      return {
        transientTreeNodes: {
          ...state.transientTreeNodes,
          [pathKey]: [...existing, ...fresh],
        },
      }
    }),
    // New model load: ids are only unique within one file, so stale rows
    // from the previous model must not leak into the next tree.
    clearTransientTreeNodes: () => set(() => ({transientTreeNodes: {}})),
  }
}
