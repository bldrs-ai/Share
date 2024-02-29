import {
  getLatestCommitHash,
} from './Commits'


describe('net/github/Commits', () => {
  it('get latest commit hash', async () => {
    const result = await getLatestCommitHash('testowner', 'testrepo', '', '', '')
    expect(result).toEqual('testsha')
  })
})
