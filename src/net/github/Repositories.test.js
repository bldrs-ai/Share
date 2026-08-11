import {getRepositories} from './Repositories'
import {MOCK_REPOSITORY} from './Repositories.fixture'


describe('net/github/Repositories', () => {
  describe('getRepositories', () => {
    it('successfully get repositories', async () => {
      const res = await getRepositories('bldrs-ai')
      // getRepositories returns the paginated array of repos directly
      // (GitHub's org-repos endpoint returns a bare array).
      expect(res).toEqual([MOCK_REPOSITORY])
    })
  })
})
