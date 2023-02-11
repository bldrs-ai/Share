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
    createdNotes: null,
    deletedNotes: null,
    synchNotes: true,
    comments: null,
    selectedNoteId: null,
    selectedNoteIndex: null,
    setNotes: (notes) => set(() => ({notes: notes})),
    toggleSynchNotes: () => set((state) => ({synchNotes: !state.synchNotes})),
    createNoteOn: () => set((state) => ({createNote: true})),
    createNoteOff: () => set((state) => ({createNote: false})),
    setCreatedNotes: (createdNotes) => set(() => ({createdNotes: createdNotes})),
    setDeletedNotes: (deletedNotes) => set(() => ({deletedNotes: deletedNotes})),
    setComments: (comments) => set(() => ({comments: comments})),
    setSelectedNoteId: (noteId) => set(() => ({selectedNoteId: noteId})),
    setSelectedNoteIndex: (noteIndex) => set(() => ({selectedNoteIndex: noteIndex})),
  }
}
