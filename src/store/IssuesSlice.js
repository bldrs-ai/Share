/**
 * Data stored in Zustand for Issues state.
 * @param {function} set
 * @param {function} get
 * @return {Object} Zustand slice.
 */
export default function createIssuesSlice(set, get) {
  return {
    issues: [],
    replies: [],
    selectedIssueId: null,
    selectedIssueIndex: null,
    setIssues: (issues) => set(() => ({issues: issues})),
    setComments: (comments) => set(() => ({comments: comments})),
    setSelectedIssueId: (issueId) => set(() => ({selectedIssueId: issueId})),
    setSelectedIssueIndex: (issueIndex) => set(() => ({selectedIssueIndex: issueIndex})),
  }
}
