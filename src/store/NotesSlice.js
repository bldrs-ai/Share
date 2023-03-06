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
    isCreateNoteActive: false,
    deleteNote: false,
    createdNotes: null,
    deletedNotes: null,
    synchNotes: true,
    comments: null,
    selectedNoteId: null,
    selectedNoteIndex: null,
    placeMark: null,
    placeMarkActivated: false,
    placeMarkNoteId: null,
    setNotes: (notes) => set(() => ({notes: notes})),
    toggleSynchNotes: () => set((state) => ({synchNotes: !state.synchNotes})),
    toggleIsCreateNoteActive: () => set((state) => ({isCreateNoteActive: !state.isCreateNoteActive})),
    toggleDeleteNote: () => set((state) => ({isCreateNoteActive: !state.deleteNote})),
    setCreatedNotes: (createdNotes) => set(() => ({createdNotes: createdNotes})),
    setDeletedNotes: (deletedNotes) => set(() => ({deletedNotes: deletedNotes})),
    setComments: (comments) => set(() => ({comments: comments})),
    setSelectedNoteId: (noteId) => set(() => ({selectedNoteId: noteId})),
    setSelectedNoteIndex: (noteIndex) => set(() => ({selectedNoteIndex: noteIndex})),
    setPlaceMark: (newPlaceMark) => set(() => ({placeMark: newPlaceMark})),
    setPlaceMarkActivated: (newPlaceMarkActivated) => set(() => ({placeMarkActivated: newPlaceMarkActivated})),
    setPlaceMarkNoteId: (newPlaceMarkNoteId) => set(() => ({placeMarkNoteId: newPlaceMarkNoteId})),
  }
}
