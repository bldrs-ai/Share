const isOpfsEnabled = process.env.OPFS_IS_ENABLED
const OAUTH_2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID


/**
 * Data stored in Zustand for App state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createAppSlice(set, get) {
  return {
    appPrefix: null,
    setAppPrefix: (prefix) => set(() => ({appPrefix: prefix})),

    isAppStoreOpen: false,
    toggleAppStoreDrawer: () => set((state) => ({isAppStoreOpen: !state.isAppStoreOpen})),

    selectedStoreApp: null,
    setSelectedStoreApp: (appInfo) => set(() => ({selectedStoreApp: appInfo})),
    // Depended on by CadView.  When enabled, null lets detection code set first time.
    isOPFSAvailable: isOpfsEnabled ? null : false,
    setIsOPFSAvailable: (is) => set(() => ({isOPFSAvailable: isOpfsEnabled ? is : false})),
    file: OAUTH_2_CLIENT_ID === 'cypresstestaudience' ? new File([], 'mockFile.ifc') : null,
    setFile: (modelFile) => set(() => ({file: modelFile})),
  }
}
