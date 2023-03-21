/**
 * Data stored in Zustand for UI components visibility state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createUIVisibilitySlice(set, get) {
  return {
    isLoginVisible: true,
    isSearchBarVisible: true,
    isNavigationPanelVisible: true,
    isCollaborationGroupVisible: true,
    isModelInteractionGroupVisible: true,
    isSettingsVisible: true,

    isAboutDialogSuppressed: false,

    setIsLoginVisibile: (isVisible) => set(() => ({isSearchBarVisible: isVisible})),
    setIsSearchbarVisibile: (isVisible) => set(() => ({isSearchBarVisible: isVisible})),
    setIsNavigationPanelVisibile: (isVisible) => set(() => ({isNavigationPanelVisible: isVisible})),

    setIsCollaborationGroupVisibile: (isVisible) => set(() => ({isCollaborationGroupVisible: isVisible})),
    setIsModelInteractionGroupVisibile: (isVisible) => set(() => ({isModelInteractionGroupVisible: isVisible})),
    setIsSettingsVisibile: (isVisible) => set(() => ({isSettingsVisible: isVisible})),

    setIsAboutDialogSuppressed: (isSuppressed) => set(() => ({isAboutDialogSuppressed: isSuppressed})),
  }
}
