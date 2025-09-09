/**
 * Data stored in Zustand for onboarding state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createOnboardingSlice(set, get) {
  return {
    isOnboardingOverlayVisible: false,
    setIsOnboardingOverlayVisible: (isVisible) => set(() => ({isOnboardingOverlayVisible: isVisible})),
  }
}
