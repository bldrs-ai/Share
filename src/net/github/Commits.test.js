import {
  getLatestCommitHash,
} from './Commits'

import {initializeOctoKit} from './OctokitExport'


describe('net/github/Commits', () => {
  beforeEach(() => {
    initializeOctoKit(false) // Default to unauthenticated initialization
  })

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

  describe('Unauthenticated initialization', () => {
    it('should NOT throw an error on getLatestCommitHash with unauthedcaseowner and unauthedcaserepo', async () => {
      const result = await getLatestCommitHash('unauthedcaseowner', 'unauthedcaserepo', '', '', '')
      expect(result).toEqual('testsha1testsha1testsha1testsha1testsha1')
    })
  })

  describe('Authenticated initialization', () => {
    beforeEach(() => {
      // Authenticated initialization for this test
      initializeOctoKit(true)
    })

    it('should NOT throw an error on getLatestCommitHash with authedcaseowner and authedcaserepo', async () => {
      const result = await getLatestCommitHash('authedcaseowner', 'authedcaserepo', '', '', '')
      expect(result).toEqual('testsha1testsha1testsha1testsha1testsha1')
    })

    afterEach(() => {
      // Reset to unauthenticated for subsequent tests
      initializeOctoKit(false)
    })
  })
})
