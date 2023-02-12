/**
 * Data stored in Zustand for Isolator state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createIsolatorSlice(set, get) {
  return {
    hiddenElements: [],
    isolatedElements: [],
    isTempIsolationModeOn: false,

    setHiddenElements: (elements) => set(() => ({hiddenElements: elements})),
    setIsolatedElements: (elements) => set(() => ({isolatedElements: elements})),
    setIsTempIsolationModeOn: (isOn) => set(() => ({isTempIsolationModeOn: isOn})),
  }
}
