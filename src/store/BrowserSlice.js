const isOpfsEnabled = process.env.OPFS_IS_ENABLED
const OAUTH_2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID


/**
 * Data stored in Zustand for Browser capabilities.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice
 */
export default function createBrowserSlice(set, get) {
  return {
    // Depended on by CadView.  When enabled, null lets detection code set first time.
    isOpfsAvailable: isOpfsEnabled ? null : false,
    setIsOpfsAvailable: (is) => set(() => ({isOpfsAvailable: isOpfsEnabled ? is : false})),
    opfsFile: (OAUTH_2_CLIENT_ID === 'cypresstestaudience' ||
      OAUTH_2_CLIENT_ID === 'testaudiencejest') ? new File([], 'mockFile.ifc') : null,
    setOpfsFile: (modelFile) => set(() => ({opfsFile: modelFile})),
  }
}
