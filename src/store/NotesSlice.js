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
    commentMutatedSignal: false,
    signalCommentMutated: () => set((state) => ({commentMutatedSignal: !state.commentMutatedSignal})),

    createdNotes: null,
    setCreatedNotes: (createdNotes) => set(() => ({createdNotes: createdNotes})),

    deletedNotes: null,
    // Prune per-note edit state when a note is deleted so editBodies,
    // editModes, and editOriginalBodies don't grow unbounded across a
    // session.
    setDeletedNotes: (deletedNotes) => set((state) => {
      if (!deletedNotes || deletedNotes.id === undefined) {
        return {deletedNotes}
      }
      const id = deletedNotes.id
      const editBodies = {...state.editBodies}
      const editModes = {...state.editModes}
      const editOriginalBodies = {...state.editOriginalBodies}
      delete editBodies[id]
      delete editModes[id]
      delete editOriginalBodies[id]
      return {deletedNotes, editBodies, editModes, editOriginalBodies}
    }),

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

    // Drop the marker state of the model being left, for a switch to a
    // different model without a page load (open-205, `?feature=spaModelNav`,
    // and the alert's Reset). A page load starts from these initial values;
    // in-app they used to carry over, so the next model's viewer put down the
    // left model's markers, NotesControl skipped the refetch (it does while a
    // note is selected and markers exist), and MarkerControl wrote the left
    // selection back into the new model's URL hash. Called by Share.jsx when
    // the model path's identity changes; a viewer re-created for the same
    // model (a theme change) keeps all of it, as #2017 requires.
    //
    // Notes themselves are the repository's and are refetched for the new
    // model; the note selection goes because it came from the old URL's hash.
    forgetModelMarkers: () => set({
      markers: [],
      selectedPlaceMarkId: null,
      selectedPlaceMarkInNoteId: null,
      cameraHash: null,
      forceMarkerNoteSync: false,
      placeMarkId: null,
      placeMarkMode: false,
      isPlaceMarkActivated: false,
      selectedNoteId: null,
      selectedNoteIndex: null,
    }),

    notes: null,
    setNotes: (notes) => set(() => ({notes: notes})),

    placeMark: null,
    setPlaceMark: (newPlaceMark) => set(() => ({placeMark: newPlaceMark})),

    isPlaceMarkActivated: false,
    setIsPlaceMarkActivated: (is) => set(() => ({isPlaceMarkActivated: is})),

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
