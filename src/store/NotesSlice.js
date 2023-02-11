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
    createNote: false,
    comments: null,
    selectedNoteId: null,
    selectedNoteIndex: null,
    setNotes: (notes) => set(() => ({notes: notes})),
    createNoteOn: () => set((state) => ({createNote: true})),
    createNoteOff: () => set((state) => ({createNote: false})),
    setComments: (comments) => set(() => ({comments: comments})),
    setSelectedNoteId: (noteId) => set(() => ({selectedNoteId: noteId})),
    setSelectedNoteIndex: (noteIndex) => set(() => ({selectedNoteIndex: noteIndex})),
  }
}
