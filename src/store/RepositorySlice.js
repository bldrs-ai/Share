/**
 * Data stored in Zustand for Repository state.
 * @param {function} set
 * @param {function} get
 * @return {Object} Zustand slice.
 */
export default function createRepositorySlice(set, get) {
  return {
    repository: null,
    setRepository: (orgName, repoName) => set(() => ({
      repository: {
        orgName: orgName,
        name: repoName,
      },
    })),
    filepath: null,
    setFilepath: (path) => set(() => ({filepath: path})),
  }
}
