import create from 'zustand'

const useStore = create(set => ({
  isDrawerOpen: false,
  isCommentsOn: false,
  isPropertiesOn: false,
  toggleDrawer: () => set(state => ({ isDrawerOpen: false })),
  openDrawer: () => set(state => ({ isDrawerOpen: true })),
  closeDrawer: () => set(state => ({ isDrawerOpen: false })),
  toggleIsCommentsOn: () => set(state => ({ isCommentsOn: !state.isCommentsOn })),
  toggleIsPropertiesOn: () => set(state => ({ isPropertiesOn: !state.isPropertiesOn })),
}))

 export default useStore;
