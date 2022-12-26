/**
 * Data stored in Zustand for UI components visibility state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createUIVisibilitySlice(set, get) {
  return {
    isSearchBarVisible: true,
    isNavigationPanelVisible: true,
    isCollaborationGroupVisible: true,
    isModelInteractionGroupVisible: true,
    isSettingsVisible: true,

    getFirstDividerVisiblility: () => get().isCollaborationGroupVisible &&
      (get().isModelInteractionGroupVisible || get().isSettingsVisible),

    getSecondDividerVisiblility: () => get().isSettingsVisible && get().isModelInteractionGroupVisible,

    setSearchbarVisibility: (isVisible) => set(() => ({isSearchBarVisible: isVisible})),
    setNavigationPanelVisibility: (isVisible) => set(() => ({isNavigationPanelVisible: isVisible})),

    setCollaborationGroupVisibility: (isVisible) => set(() => ({isCollaborationGroupVisible: isVisible})),
    setModelInteractionGroupVisibility: (isVisible) => set(() => ({isModelInteractionGroupVisible: isVisible})),
    setSettingsVisibility: (isVisible) => set(() => ({isSettingsVisible: isVisible})),
  }
}
