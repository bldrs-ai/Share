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
    // The model path `hiddenElements` belongs to. `CadView#onViewer` clears
    // the hidden state when a different path loads, and keeps it across a
    // viewer re-init of the same path (a theme change reloads the model).
    hiddenElementsModelPath: null,
    // Whether IfcIsolator#setModel has seeded the current path's scene-graph
    // loader defaults (overlays the loader hid) into `hiddenElements`. Reset
    // with the path, so a re-init doesn't seed over the user's own state.
    sceneGraphDefaultsSeeded: false,
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

    /**
     * Make `hiddenElements` belong to the model at `modelPath`. Element ids are
     * per file (serials on scene-graph formats), so hidden state left by a
     * different model is dropped, along with its scene-graph seeding flag. The
     * same path again (a viewer re-init: a theme change reloads the model)
     * keeps it, for `CadView#onViewer` to reapply.
     *
     * @param {string} modelPath
     * @return {void}
     */
    claimHiddenElementsForModel: (modelPath) => set((state) => (
      state.hiddenElementsModelPath === modelPath ? {} :
        {hiddenElements: {}, hiddenElementsModelPath: modelPath, sceneGraphDefaultsSeeded: false})),
    setIsolatedElements: (elements) => set(() => ({isolatedElements: elements})),
    setIsTempIsolationModeOn: (isOn) => set(() => ({isTempIsolationModeOn: isOn})),
  }
}
