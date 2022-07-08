const craeateIssuesSlice = (set, get) => ({
  issues: [],
  replies: [],
  selectedIssueId: null,
  selectedIssueIndex: null,
  setIssues: (issues) => set(() => ({issues: issues})),
  setComments: (comments) => set(() => ({comments: comments})),
  setSelectedIssueId: (issueId) => set(() => ({selectedIssueId: issueId})),
  setSelectedIssueIndex: (issueIndex) => set(() => ({selectedIssueIndex: issueIndex})),
})
export default craeateIssuesSlice

