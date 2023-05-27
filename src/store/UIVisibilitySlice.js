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
    isSearchBarVisible: false,
    isOpenControlVisible: false,
    isNavigationPanelVisible: true,
    isCollaborationGroupVisible: true,
    isModelInteractionGroupVisible: true,
    isSettingsVisible: true,
    isTreeVisible: false,
    isBranchControlVisible: true,
    isFilePathVisible: true,
    isAboutDialogSuppressed: false,

    setIsLoginVisibile: (isVisible) => set(() => ({isSearchBarVisible: isVisible})),
    setIsSearchbarVisibile: (isVisible) => set(() => ({isSearchBarVisible: isVisible})),
    setIsNavigationPanelVisibile: (isVisible) => set(() => ({isNavigationPanelVisible: isVisible})),

    setIsCollaborationGroupVisibile: (isVisible) => set(() => ({isCollaborationGroupVisible: isVisible})),
    setIsModelInteractionGroupVisibile: (isVisible) => set(() => ({isModelInteractionGroupVisible: isVisible})),
    setIsSettingsVisibile: (isVisible) => set(() => ({isSettingsVisible: isVisible})),

    setIsAboutDialogSuppressed: (isSuppressed) => set(() => ({isAboutDialogSuppressed: isSuppressed})),
    toggleIsNavigationPanelVisible: () => set((state) => ({isNavigationPanelVisible: !state.isNavigationPanelVisible})),
    toggleIsBranchControlVisible: () => set((state) => ({isBranchControlVisible: !state.isBranchControlVisible})),
    toggleIsSearchBarVisible: () => set((state) => ({isSearchBarVisible: !state.isSearchBarVisible})),
    toggleIsOpenControlVisible: () => set((state) => ({isOpenControlVisible: !state.isOpenControlVisible})),
  }
}
