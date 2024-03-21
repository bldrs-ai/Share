import {getRepositories} from './Repositories'
import {MOCK_REPOSITORY} from './Repositories.fixture'


describe('net/github/Repositories', () => {
  describe('getRepositories', () => {
    it('successfully get repositories', async () => {
      const res = await getRepositories('bldrs-ai')
      expect(res.data).toEqual([MOCK_REPOSITORY])
    })
  })
})
