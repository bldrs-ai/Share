import {renderHook, waitFor} from '@testing-library/react'
import useVersions from './useVersions'
import {MOCK_COMMITS} from '../../net/github/Commits.fixture'


describe('useVersions', () => {
  it('fetches and returns commits', async () => {
    const {result} = renderHook(() => useVersions(TEST_PARAMS))
    await waitFor(() => expect(result.current.loading).toBe(true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.commits.length).toEqual(MOCK_COMMITS.length)
    expect(result.current.error).toBe(null)
  })
})


const TEST_PARAMS = {
  repository: {name: 'testrepo', orgName: 'testowner'},
  filePath: '',
  accessToken: '',
}
