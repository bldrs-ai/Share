import create from 'zustand'


const useStore = create((set) => ({
  viewerStore: {},
  modelStore: null,
  selectedElementStore: {},
  isDrawerOpen: false,
  isCommentsOn: false,
  isPropertiesOn: false,
  selectedIssueId: null,
  selectedCommentIndex: null,
  snackMessage: null,
  issues: [],
  replies: [],
  setViewerStore: (viewer) => set(() => ({viewerStore: viewer})),
  setModelStore: (model) => set(() => ({modelStore: model})),
  setSelectedElementStore: (element) => set(() => ({selectedElementStore: element})),
  setSnackMessage: (message) => set(() => ({snackMessage: message})),
  openDrawer: () => set(() => ({isDrawerOpen: true})),
  closeDrawer: () => set(() => ({isDrawerOpen: false})),
  toggleIsCommentsOn: () => set((state) => ({isCommentsOn: !state.isCommentsOn})),
  toggleIsPropertiesOn: () => set((state) => ({isPropertiesOn: !state.isPropertiesOn})),
  setIssues: (issues) => set(() => ({issues: issues})),
  setComments: (comments) => set(() => ({comments: comments})),
  setSelectedIssueId: (issueId) => set(() => ({selectedIssueId: issueId})),
  setSelectedIssueIndex: (issueIndex) => set(() => ({setSelectedIssueIndex: issueIndex})),
}))
export default useStore
