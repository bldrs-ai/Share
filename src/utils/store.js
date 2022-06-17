import create from 'zustand'


const useStore = create((set) => ({
  isDrawerOpen: false,
  isCommentsOn: false,
  snackMessage: null,
  setSnackMessage: (message) => set(() => ({snackMessage: message})),
  openDrawer: () => set(() => ({isDrawerOpen: true})),
  closeDrawer: () => set(() => ({isDrawerOpen: false})),
}))
export default useStore
