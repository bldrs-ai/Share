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

    activeNoteCardId: null,
    setActiveNoteCardId: (id) => set({activeNoteCardId: id}),

    addComment: true,
    toggleAddComment: () => set((state) => ({addComment: !state.addComment})),

    body: '',
    setBody: (newBody) => set({body: newBody}),

    comments: [],
    setComments: (comments) => set(() => ({comments: comments})),

    createdNotes: null,
    setCreatedNotes: (createdNotes) => set(() => ({createdNotes: createdNotes})),

    deletedNotes: null,
    setDeletedNotes: (deletedNotes) => set(() => ({deletedNotes: deletedNotes})),

    editBodies: {}, // Track editBody for each NoteCard by id
    setEditBody: (id, body) =>
      set((state) => ({
        editBodies: {...state.editBodies, [id]: body},
      })),
      editOriginalBodies: {}, // Track editBody for each NoteCard by id
      setEditOriginalBody: (id, body) =>
        set((state) => ({
          editOriginalBodies: {...state.editOriginalBodies, [id]: body},
        })),

    editModes: {}, // Keeps track of edit modes by NoteCard IDs
    setEditMode: (id, mode) =>
      set((state) => ({
        editModes: {...state.editModes, [id]: mode},
      })),

    isCreateNoteVisible: false,
    setIsCreateNoteVisible: (is) => set(() => ({isCreateNoteVisible: is})),
    toggleIsCreateNoteVisible: () => set((state) => ({isCreateNoteVisible: !state.isCreateNoteVisible})),

    isLoadingNotes: false,
    toggleIsLoadingNotes: () => set((state) => ({isLoadingNotes: !state.isLoadingNotes})),

    isNotesVisible: isVisibleInitially(),
    setIsNotesVisible: (isVisible) => set(() => ({isNotesVisible: isVisible})),
    toggleIsNotesVisible: () => set((state) => ({isNotesVisible: !state.isNotesVisible})),

    issueBody: '',
    setIssueBody: (newIssueBody) => set({issueBody: newIssueBody}),

    markers: [],
    writeMarkers: (newMarkers) => set({markers: newMarkers}), // Set markers
    clearMarkers: () => set({markers: []}), // Clear markers

    notes: null,
    setNotes: (notes) => set(() => ({notes: notes})),

    placeMark: null,
    setPlaceMark: (newPlaceMark) => set(() => ({placeMark: newPlaceMark})),

    placeMarkActivated: false,
    setPlaceMarkActivated: (newPlaceMarkActivated) =>
      set(() => ({placeMarkActivated: newPlaceMarkActivated})),

    placeMarkId: null,
    setPlaceMarkId: (newPlaceMarkId) => set(() => ({placeMarkId: newPlaceMarkId})),

    placeMarkMode: false,
    setPlaceMarkMode: (mode) => set(() => ({placeMarkMode: mode})),

    selectedCommentId: null,
    setSelectedCommentId: (commentId) => set(() => ({selectedCommentId: commentId})),

    selectedPlaceMarkId: null,
    setSelectedPlaceMarkId: (_placeMarkId) => set(() => ({selectedPlaceMarkId: _placeMarkId})),

    selectedPlaceMarkInNoteId: null,
    setSelectedPlaceMarkInNoteIdData: (placeMarkId, camHash, forceMarkerNoteSync) =>
      set({
        selectedPlaceMarkInNoteId: placeMarkId,
        cameraHash: camHash,
        forceMarkerNoteSync: forceMarkerNoteSync,
      }),
    // only used in setSelectedPlaceMarkInNoteIdData
    cameraHash: null,
    forceMarkerNoteSync: false,

    selectedNoteId: null,
    setSelectedNoteId: (noteId) => set(() => ({selectedNoteId: noteId})),

    selectedNoteIndex: null,
    setSelectedNoteIndex: (noteIndex) => set(() => ({selectedNoteIndex: noteIndex})),

    synchSidebar: true, // To render again, not related to flag
    toggleSynchSidebar: () => set((state) => ({synchSidebar: !state.synchSidebar})),
  }
}
