/**
 * Data stored in Zustand for Isolator state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createIsolatorSlice(set, get) {
  return {
    hiddenElements: {},
    // Which scene-graph model `hiddenElements` has had its loader defaults
    // seeded for (IfcIsolator#setModel). A viewer re-init of the same model
    // keeps the user's hidden state instead of re-seeding over it.
    sceneGraphSeededFor: null,
    isolatedElements: {},
    isTempIsolationModeOn: false,

    updateHiddenStatus: (elementId, isHidden) =>
      set((state) => ({
        hiddenElements: {
          ...state.hiddenElements, [elementId]: isHidden,
        },
      })),

    updateIsolatedStatus: (elementId, isIsolated) =>
      set((state) => ({
        isolatedElements: {
          ...state.isolatedElements, [elementId]: isIsolated,
        },
      })),


    setHiddenElements: (elements) => set(() => ({hiddenElements: elements})),
    setIsolatedElements: (elements) => set(() => ({isolatedElements: elements})),
    setIsTempIsolationModeOn: (isOn) => set(() => ({isTempIsolationModeOn: isOn})),
  }
}
