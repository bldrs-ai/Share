
/**
 * Data stored in Zustand for Repository state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createRepositorySlice(set, get) {
  return {
    branches: [],
    repository: null,
    accessToken: '',
    isAuthCompleted: false,
    modelPath: null,
    setRepository: (orgName, repoName) => set(() => ({
      repository: {
        orgName: orgName,
        name: repoName,
      },
    })),
    setAccessToken: (token) => set(() => ({accessToken: token})),
    setBranches: (branches) => set(() => ({issues: branches})),
    setIsAuthCompleted: (completed) => set(() => ({isAuthCompleted: completed === true})),
    setModelPath: (modelPath) => set(() => ({modelPath: modelPath})),
  }
}
