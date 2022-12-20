/**
 * Data stored in Zustand for API state.
 *
 * @return {object} Zustand slice.
 */
export default function createAPISlice(set) {
  return {
    selectElementsDebounce: false,
    deselectElementsDebounce: false,
    setSelectElementsDebounce: (isDebounceOn) => set(() => ({selectElementsDebounce: isDebounceOn})),
    setDeselectElementsDebounce: (isDebounceOn) => set(() => ({deselectElementsDebounce: isDebounceOn})),
  }
}
