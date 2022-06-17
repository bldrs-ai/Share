const createUISlice = (set, get) => ({
  isDrawerOpen: false,
  isPropertiesOn: false,
  isCommentsOn: false,
  snackMessage: null,
  openDrawer: () => set(() => ({isDrawerOpen: true})),
  closeDrawer: () => set(() => ({isDrawerOpen: false})),
  toggleIsPropertiesOn: () => set((state) => ({isPropertiesOn: !state.isPropertiesOn})),
  toggleIsCommentsOn: () => set((state) => ({isCommentsOn: !state.isCommentsOn})),
  setSnackMessage: (message) => set(() => ({snackMessage: message})),
})

export default createUISlice
