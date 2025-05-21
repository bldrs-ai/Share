
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

    appMetadata: {},
    setAppMetadata: (metadata) => set({appMetadata: metadata}),

    branches: [],
    setBranches: (branches) => set(() => ({issues: branches})),

    modelPath: null,
    setModelPath: (path) => set(() => ({modelPath: path})),

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
