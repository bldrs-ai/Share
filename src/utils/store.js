import create from 'zustand'

const useStore = create(set => ({
  isDrawerOpen: false,
  isCommentsOn: false,
  isPropertiesOn: false,
  selectedCommentId: null,
  issues:[],
  replies:[],
  modelStore:null,
  selectedElementStore:{},
  toggleDrawer: () => set(() => ({ isDrawerOpen: false })),
  openDrawer: () => set(() => ({ isDrawerOpen: true })),
  closeDrawer: () => set(() => ({ isDrawerOpen: false })),
  toggleIsCommentsOn: () => set(state => ({ isCommentsOn: !state.isCommentsOn })),
  toggleIsPropertiesOn: () => set(state => ({ isPropertiesOn: !state.isPropertiesOn })),
  setModelStore: (model) => set(state => ({modelStore: model})),
  setSelectedElementStore: (element) => set(state => ({selectedElementStore: element})),
  setIssues: (issues) => set(state => ({issues: issues})),
  setReplies: (replies) => set(state => ({replies: replies})),
  setSelectedComment: (issue) => set(state => ({selectedCommentId: issue})),
}))

 export default useStore;
