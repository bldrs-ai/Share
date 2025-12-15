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
    onboardingOverlaySource: null, // 'help' or 'about' - tracks which component should render the overlay
    setIsOnboardingOverlayVisible: (isVisible, source = null) => set(() => ({
      isOnboardingOverlayVisible: isVisible,
      onboardingOverlaySource: source,
    })),
  }
}
