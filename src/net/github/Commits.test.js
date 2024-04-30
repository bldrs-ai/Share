import {
  getLatestCommitHash,
} from './Commits'


describe('net/github/Commits', () => {
  it('get latest commit hash', async () => {
    const result = await getLatestCommitHash('testowner', 'testrepo', '', '', '')
    expect(result).toEqual('testsha1testsha1testsha1testsha1testsha1')
  })

  describe('get latest commit hash failure case', () => {
    it('should throw an error when failing to get the latest commit hash', async () => {
      // Simulate failure conditions by passing specific owner and repo that would trigger the error
      await expect(getLatestCommitHash('failurecaseowner', 'failurecaserepo', '', '', ''))
        .rejects
        .toThrow('Unknown error: {"sha":"error"}')
    })
  })
})
