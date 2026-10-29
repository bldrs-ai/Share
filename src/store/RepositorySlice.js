
/**
 * Data stored in Zustand for Repository state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createRepositorySlice(set, get) {
  return {
    accessToken: '',
    setAccessToken: (token) => set(() => ({accessToken: token})),

    hasGithubIdentity: false,
    setHasGithubIdentity: (hasIdentity) => set(() => ({hasGithubIdentity: hasIdentity})),

    // Distinguishes "not yet checked" from "checked, no GitHub identity".
    // Google-only users legitimately end up with accessToken='' and
    // hasGithubIdentity=false — the same as the initial pre-auth state —
    // so consumers that gate on auth (e.g. CadView model load) need this
    // flag to know whether they should wait or proceed.
    isAuthResolved: false,
    // Which sign-in state that settlement was FOR: the Auth0
    // `isAuthenticated` of the BaseRoutes pass that set isAuthResolved, null
    // when unsettled or when the setter wasn't told. isAuthResolved alone
    // can't say: a popup sign-in happens after the signed-out pass already
    // set it true, and BaseRoutes doesn't reset it while the new session's
    // token fetch runs (every load gate reads it, and it means "the token,
    // if any, is in"). So for that window isAuthResolved is true while the
    // claims are still the signed-out pass's. A reader that combines the
    // LIVE isAuthenticated with the store's claims compares the two first:
    // privacy/modelActionTracking.js. Set in the same write as
    // isAuthResolved so no subscriber sees one without the other.
    authResolvedFor: null,
    setIsAuthResolved: (resolved, forIsAuthenticated = null) => set(() => ({
      isAuthResolved: resolved,
      authResolvedFor: resolved ? forIsAuthenticated : null,
    })),

    appMetadata: {},
    setAppMetadata: (metadata) => set({appMetadata: metadata}),

    branches: [],
    setBranches: (branches) => set(() => ({issues: branches})),

    modelPath: null,
    setModelPath: (path) => set(() => ({modelPath: path})),

    // How CadView downloaded the loaded Drive file — `{fileId, connection}`,
    // connection null for an API-key download — so an export can classify
    // the file's sharing the way its open's meter did
    // (quota/driveExportVisibility.js). Null for anything else.
    modelDriveDownload: null,
    setModelDriveDownload: (download) => set(() => ({modelDriveDownload: download})),

    repository: null,
    /**
     * Set or clear the current repository.
     * Passing falsy values will reset repository to null.
     *
     * @param {string?} org Organization name
     * @param {string?} repo Repository name
     * @return {void}
     */
    setRepository: (org, repo) =>
      set(() => ({
        repository: org && repo ? {orgName: org, name: repo} : null,
      })),
  }
}
