import {isVisibleInitially} from '../Components/Notes/hashState'


/**
 * Data stored in Zustand for Notes state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createNotesSlice(set, get) {
  return {
    isNotesEnabled: true,
    setIsNotesEnabled: (isEnabled) => set(() => ({isNotesEnabled: isEnabled})),

    comments: null,
    createdNotes: null,
    deletedNotes: null,
    isCreateNoteVisible: false,
    isLoadingNotes: false,
    isNotesVisible: isVisibleInitially(),
    notes: null,
    placeMark: null,
    placeMarkActivated: false,
    placeMarkId: null,
    selectedNoteId: null,
    selectedNoteIndex: null,
    synchSidebar: true, // To render again, not related to flag
    setComments: (comments) => set(() => ({comments: comments})),
    setCreatedNotes: (createdNotes) => set(() => ({createdNotes: createdNotes})),
    setDeletedNotes: (deletedNotes) => set(() => ({deletedNotes: deletedNotes})),
    setIsNotesVisible: (isVisible) => set(() => ({isNotesVisible: isVisible})),
    setNotes: (notes) => set(() => ({notes: notes})),
    setPlaceMark: (newPlaceMark) => set(() => ({placeMark: newPlaceMark})),
    setPlaceMarkActivated: (newPlaceMarkActivated) =>
      set(() => ({placeMarkActivated: newPlaceMarkActivated})),
    setPlaceMarkId: (newPlaceMarkId) => set(() => ({placeMarkId: newPlaceMarkId})),
    setSelectedNoteId: (noteId) => set(() => ({selectedNoteId: noteId})),
    setSelectedNoteIndex: (noteIndex) => set(() => ({selectedNoteIndex: noteIndex})),
    toggleIsCreateNoteVisible: () =>
      set((state) => ({isCreateNoteVisible: !state.isCreateNoteVisible})),
    toggleIsLoadingNotes: () => set((state) => ({isLoadingNotes: !state.isLoadingNotes})),
    toggleIsNotesVisible: () => set((state) => ({isNotesVisible: !state.isNotesVisible})),
    toggleSynchSidebar: () => set((state) => ({synchSidebar: !state.synchSidebar})),
  }
}
