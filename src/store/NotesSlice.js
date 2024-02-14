/**
 * Data stored in Zustand for Notes state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createNotesSlice(set, get) {
  return {
    comments: null,
    createdNotes: null,
    deletedNotes: null,
    editNoteMode: false,
    isLoadingNotes: false,
    isCreateNoteActive: false,
    notes: null,
    placeMark: null,
    placeMarkId: null,
    placeMarkActivated: false,
    synchSidebar: true, // To render again, not related to flag
    selectedNoteId: null,
    selectedNoteIndex: null,
    setComments: (comments) => set(() => ({comments: comments})),
    setCreatedNotes: (createdNotes) => set(() => ({createdNotes: createdNotes})),
    setDeletedNotes: (deletedNotes) => set(() => ({deletedNotes: deletedNotes})),
    setNotes: (notes) => set(() => ({notes: notes})),
    setPlaceMark: (newPlaceMark) => set(() => ({placeMark: newPlaceMark})),
    setPlaceMarkId: (newPlaceMarkId) => set(() => ({placeMarkId: newPlaceMarkId})),
    setPlaceMarkActivated: (newPlaceMarkActivated) => set(() => ({placeMarkActivated: newPlaceMarkActivated})),
    setSelectedNoteId: (noteId) => set(() => ({selectedNoteId: noteId})),
    setSelectedNoteIndex: (noteIndex) => set(() => ({selectedNoteIndex: noteIndex})),
    toggleEditNoteMode: () => set((state) => ({editNoteMode: !state.editNoteMode})),
    toggleIsLoadingNotes: () => set((state) => ({isLoadingNotes: !state.isLoadingNotes})),
    toggleIsCreateNoteActive: () => set((state) => ({isCreateNoteActive: !state.isCreateNoteActive})),
    toggleSynchSidebar: () => set((state) => ({synchSidebar: !state.synchSidebar})),
  }
}
