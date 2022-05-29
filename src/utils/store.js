import create from 'zustand'

const useStore = create(set => ({
  isDrawerOpen: false,
  isCommentsOn: false,
  isPropertiesOn: false,
  selectedComment: null,
  modelStore:null,
  selectedElementStore:{},
  toggleDrawer: () => set(() => ({ isDrawerOpen: false })),
  openDrawer: () => set(() => ({ isDrawerOpen: true })),
  closeDrawer: () => set(() => ({ isDrawerOpen: false })),
  toggleIsCommentsOn: () => set(state => ({ isCommentsOn: !state.isCommentsOn })),
  toggleIsPropertiesOn: () => set(state => ({ isPropertiesOn: !state.isPropertiesOn })),
  setModelStore: (model) => set(state => ({modelStore: model})),
  setSelectedElementStore: (element) => set(state => ({selectedElementStore: element})),
  setSelectedComment: (commentID) => set(state => ({selectedComment: commentID})),
}))

 export default useStore;
