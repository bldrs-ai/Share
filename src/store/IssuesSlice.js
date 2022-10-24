/**
 * Data stored in Zustand for Issues state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createIssuesSlice(set, get) {
  return {
    issues: null,
    comments: null,
    selectedIssueId: null,
    selectedIssueIndex: null,
    setIssues: (issues) => set(() => ({issues: issues})),
    setComments: (comments) => set(() => ({comments: comments})),
    setSelectedIssueId: (issueId) => set(() => ({selectedIssueId: issueId})),
    setSelectedIssueIndex: (issueIndex) => set(() => ({selectedIssueIndex: issueIndex})),
  }
}
