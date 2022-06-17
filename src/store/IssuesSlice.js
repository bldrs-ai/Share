const craeateIssuesSlice = (set, get) => ({
  issues: [],
  replies: [],
  selectedIssueId: null,
  selectedCommentIndex: null,
  setIssues: (issues) => set(() => ({issues: issues})),
  setComments: (comments) => set(() => ({comments: comments})),
  setSelectedIssueId: (issueId) => set(() => ({selectedIssueId: issueId})),
  setSelectedCommentIndex: (issueIndex) => set(() => ({selectedCommentIndex: issueIndex})),
})
export default craeateIssuesSlice

