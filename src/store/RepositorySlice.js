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
    modelPath: null,
    setRepository: (orgName, repoName) =>
      set(() => ({
        repository: {
          orgName: orgName,
          name: repoName,
        },
      })),
    setBranches: (branches) => set(() => ({issues: branches})),
    setModelPath: (modelPath) => set(() => ({modelPath: modelPath})),
  }
}
