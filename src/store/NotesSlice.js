/**
 * Data stored in Zustand for Notes state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createNotesSlice(set, get) {
  return {
    notes: null,
    comments: null,
    selectedNoteId: null,
    selectedNoteIndex: null,
    placeMark: null,
    setNotes: (notes) => set(() => ({notes: notes})),
    setComments: (comments) => set(() => ({comments: comments})),
    setSelectedNoteId: (noteId) => set(() => ({selectedNoteId: noteId})),
    setSelectedNoteIndex: (noteIndex) => set(() => ({selectedNoteIndex: noteIndex})),
    setPlaceMark: (newPlaceMark) => set(() => ({placeMark: newPlaceMark})),
  }
}
