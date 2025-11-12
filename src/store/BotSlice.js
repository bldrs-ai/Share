/**
 * Data stored in Zustand for Bot state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createBotSlice(set) {
  return {
    isBotVisible: true,
    setIsBotVisible: (isVisible) => set(() => ({isBotVisible: isVisible})),
    toggleIsBotVisible: () => set((state) => ({isBotVisible: !state.isBotVisible})),
  }
}

