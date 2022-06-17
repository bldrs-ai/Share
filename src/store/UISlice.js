const createUISlice = (set, get) => ({
  isDrawerOpen: false,
  isCommentsOn: false,
  snackMessage: null,
  isPropertiesOn: false,
  setSnackMessage: (message) => set(() => ({snackMessage: message})),
  openDrawer: () => set(() => ({isDrawerOpen: true})),
  closeDrawer: () => set(() => ({isDrawerOpen: false})),
  toggleIsPropertiesOn: () => set((state) => ({isPropertiesOn: !state.isPropertiesOn})),
})

export default createUISlice
