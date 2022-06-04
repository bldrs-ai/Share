import create from 'zustand'


const useStore = create((set) => ({
  isDrawerOpen: false,
  isCommentsOn: false,
  isPropertiesOn: false,
  selectedCommentId: null,
  selectedCommentIndex: null,
  issues: [],
  replies: [],
  modelStore: null,
  selectedElementStore: {},
  toggleDrawer: () => set(() => ({isDrawerOpen: false})),
  openDrawer: () => set(() => ({isDrawerOpen: true})),
  closeDrawer: () => set(() => ({isDrawerOpen: false})),
  toggleIsCommentsOn: () => set((state) => ({isCommentsOn: !state.isCommentsOn})),
  toggleIsPropertiesOn: () => set((state) => ({isPropertiesOn: !state.isPropertiesOn})),
  setModelStore: (model) => set(() => ({modelStore: model})),
  setSelectedElementStore: (element) => set(() => ({selectedElementStore: element})),
  setIssues: (issues) => set(() => ({issues: issues})),
  setReplies: (replies) => set(() => ({replies: replies})),
  setSelectedComment: (issueId) => set(() => ({selectedCommentId: issueId})),
  setSelectedCommentIndex: (issueIndex) => set(() => ({selectedCommentIndex: issueIndex})),
}))

export default useStore
