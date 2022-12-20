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
    isBranchesControlVisible: true,
    isNavPanelVisible: true,
    isShareControlVisible: true,
    isNotesVisible: true,
    isPropertiesVisible: true,
    isCutPlaneMenuVisible: true,
    isExtractLevelsMenuVisible: true,
    isClearButtonVisible: true,
    isThemeButtonVisible: true,
    isAboutControlVisible: true,

    getFirstDividerVisiblility: () => get().isShareControlVisible &&
      (get().isNotesVisible || get().isPropertiesVisible ||
        get().isCutPlaneMenuVisible || get().isExtractLevelsMenuVisible ||
        get().isClearButtonVisible || get().isThemeButtonVisible || get().isAboutControlVisible),

    getSecondDividerVisiblility: () => (get().isThemeButtonVisible || get().isAboutControlVisible) &&
        (get().isNotesVisible || get().isPropertiesVisible ||
          get().isCutPlaneMenuVisible || get().isExtractLevelsMenuVisible || get().isClearButtonVisible),

    setSearchbarVisibility: (isVisible) => set(() => ({isSearchBarVisible: isVisible})),
    setBranchesControlVisibility: (isVisible) => set(() => ({isBranchesControlVisible: isVisible})),
    setNavPanelVisibility: (isVisible) => set(() => ({isNavPanelVisible: isVisible})),
    setShareControlVisibility: (isVisible) => set(() => ({isShareControlVisible: isVisible})),
    setNotesVisibility: (isVisible) => set(() => ({isNotesVisible: isVisible})),
    setPropertiesVisibility: (isVisible) => set(() => ({isPropertiesVisible: isVisible})),
    setCutPlaneMenuVisibility: (isVisible) => set(() => ({isCutPlaneMenuVisible: isVisible})),
    setExtractLevelsMenuVisibility: (isVisible) => set(() => ({isExtractLevelsMenuVisible: isVisible})),
    setClearButtonVisibility: (isVisible) => set(() => ({isClearButtonVisible: isVisible})),
    setThemeButtonVisibility: (isVisible) => set(() => ({isThemeButtonVisible: isVisible})),
    setAboutControlVisibility: (isVisible) => set(() => ({isAboutControlVisible: isVisible})),
  }
}
