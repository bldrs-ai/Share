import create from 'zustand'


const useStore = create((set) => ({
  isDrawerOpen: false,
  isCommentsOn: false,
  isPropertiesOn: false,
  selectedIssueId: null,
  selectedCommentIndex: null,
  snackMessage: null,
  issues: [],
  replies: [],
  modelStore: null,
  selectedElementStore: {},
  viewerStore: {},
  toggleDrawer: () => set(() => ({isDrawerOpen: false})),
  openDrawer: () => set(() => ({isDrawerOpen: true})),
  closeDrawer: () => set(() => ({isDrawerOpen: false})),
  toggleIsCommentsOn: () => set((state) => ({isCommentsOn: !state.isCommentsOn})),
  toggleIsPropertiesOn: () => set((state) => ({isPropertiesOn: !state.isPropertiesOn})),
  setModelStore: (model) => set(() => ({modelStore: model})),
  setSelectedElementStore: (element) => set(() => ({selectedElementStore: element})),
  setViewerStore: (viewer) => set(() => ({viewerStore: viewer})),
  setIssues: (issues) => set(() => ({issues: issues})),
  setComments: (comments) => set(() => ({comments: comments})),
  setSelectedIssueId: (issueId) => set(() => ({selectedIssueId: issueId})),
  setSelectedCommentIndex: (issueIndex) => set(() => ({selectedCommentIndex: issueIndex})),
  setSnackMessage: (message) => set(() => ({snackMessage: message})),
}))

export default useStore
