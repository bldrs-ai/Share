const isOpfsEnabled = process.env.OPFS_IS_ENABLED
const OAUTH_2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID


/**
 * The Browser slice's per-model state: the OPFS file the model shown was
 * read from (open-205 #2019; see IFCSlice#ifcModelState). The slice's
 * initial `opfsFile` differs on purpose (a mock File for the test
 * audiences), so this is the value a model's state resets to, not the
 * page's first one.
 *
 * @return {object}
 */
export function browserModelState() {
  return {opfsFile: null}
}


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
