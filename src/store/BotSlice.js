import {isVisibleInitially} from '../Components/Bot/hashState'


/**
 * Data stored in Zustand for Bot state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createBotSlice(set) {
  return {
    isBotVisible: isVisibleInitially(),
    setIsBotVisible: (isVisible) => set(() => ({isBotVisible: isVisible})),
    toggleIsBotVisible: () => set((state) => ({isBotVisible: !state.isBotVisible})),
  }
}

