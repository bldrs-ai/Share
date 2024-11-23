/**
 * Whether UI elts like login, nav, etc. are enabled.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createUIEnabledSlice(set, get) {
  return {
    // TODO(pablo): move all of these to feature slice files
    // NOTE: Nav, Notes, Search and Versions have been moved to their Slices
    isAboutEnabled: true,
    isImagineEnabled: false, // service failing
    isLoginEnabled: true,
    isModelActionsEnabled: true,
    isShareEnabled: true,
    setIsAboutEnabled: (isEnabled) => set(() => ({isAboutEnabled: isEnabled})),
    setIsImagineEnabled: (isEnabled) => set(() => ({isImagineEnabled: isEnabled})),
    setIsLoginEnabled: (isEnabled) => set(() => ({isLoginEnabled: isEnabled})),
    setIsModelActionsEnabled: (isEnabled) => set(() => ({isModelActionsEnabled: isEnabled})),
    setIsShareEnabled: (isEnabled) => set(() => ({isShareEnabled: isEnabled})),
  }
}
