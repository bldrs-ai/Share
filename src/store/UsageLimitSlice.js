/**
 * Data stored in Zustand for usage limit dialog state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createUsageLimitSlice(set, get) {
  return {
    isUsageLimitDialogVisible: false,
    usageLimitInfo: null, // {reason, stats} from canLoadModel()
    setIsUsageLimitDialogVisible: (isVisible, info = null) => set({
      isUsageLimitDialogVisible: isVisible,
      usageLimitInfo: info,
    }),
  }
}
