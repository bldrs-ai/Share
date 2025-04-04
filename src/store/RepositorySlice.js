
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
    setRepository: (org, repo) => set(() => ({
      repository: {
        orgName: org,
        name: repo,
      },
    })),
  }
}
