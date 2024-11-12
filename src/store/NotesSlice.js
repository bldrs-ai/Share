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
    addComment: true,
    comments: [],
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
    selectedCommentId: null,
    selectedNoteIndex: null,
    synchSidebar: true, // To render again, not related to flag
    placeMarkMode: false,
    setPlaceMarkMode: (mode) => set(() => ({placeMarkMode: mode})),
    setComments: (comments) => set(() => ({comments: comments})),
    setCreatedNotes: (createdNotes) => set(() => ({createdNotes: createdNotes})),
    setDeletedNotes: (deletedNotes) => set(() => ({deletedNotes: deletedNotes})),
    setIsNotesVisible: (isVisible) => set(() => ({isNotesVisible: isVisible})),
    setNotes: (notes) => set(() => ({notes: notes})),
    setPlaceMark: (newPlaceMark) => set(() => ({placeMark: newPlaceMark})),
    setPlaceMarkActivated: (newPlaceMarkActivated) =>
      set(() => ({placeMarkActivated: newPlaceMarkActivated})),
    setPlaceMarkId: (newPlaceMarkId) => set(() => ({placeMarkId: newPlaceMarkId})),
    setSelectedNote: (note) => set(() => ({selectedNote: note})),
    setSelectedNoteId: (noteId) => set(() => ({selectedNoteId: noteId})),
    setSelectedCommentId: (commentId) => set(() => ({selectedCommentId: commentId})),
    setSelectedNoteIndex: (noteIndex) => set(() => ({selectedNoteIndex: noteIndex})),
    toggleAddComment: () => set((state) => ({addComment: !state.addComment})),
    toggleIsCreateNoteVisible: () => set((state) => ({isCreateNoteVisible: !state.isCreateNoteVisible})),
    toggleIsLoadingNotes: () => set((state) => ({isLoadingNotes: !state.isLoadingNotes})),
    toggleIsNotesVisible: () => set((state) => ({isNotesVisible: !state.isNotesVisible})),
    toggleSynchSidebar: () => set((state) => ({synchSidebar: !state.synchSidebar})),
    body: '',
    issueBody: '',
    editModes: {}, // Keeps track of edit modes by NoteCard IDs
    setEditMode: (id, mode) =>
      set((state) => ({
        editModes: {...state.editModes, [id]: mode},
      })),
    editBodies: {}, // Track editBody for each NoteCard by id
    setEditBody: (id, body) =>
      set((state) => ({
        editBodies: {...state.editBodies, [id]: body},
      })),
    // Action to set the body
    setBody: (newBody) => set({body: newBody}),
    setIssueBody: (newIssueBody) => set({issueBody: newIssueBody}),
  }
}
