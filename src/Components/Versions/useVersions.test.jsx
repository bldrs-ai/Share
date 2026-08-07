import {act, renderHook, waitFor} from '@testing-library/react'
import useStore from '../../store/useStore'
import useVersions from './useVersions'
import {MOCK_COMMITS} from '../../net/github/Commits.fixture'


describe('useVersions', () => {
  it('fetches and returns commits once auth is resolved', async () => {
    await act(() => useStore.setState({isAuthResolved: true}))
    const {result} = renderHook(() => useVersions(TEST_PARAMS))
    await waitFor(() => expect(result.current.loading).toBe(true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.commits.length).toEqual(MOCK_COMMITS.data.length)
    expect(result.current.error).toBe(null)
  })

  // Pre-resolution fetches fired anonymously (isAuthenticated is still false
  // while the token exchange runs) and then re-fired authed — duplicate
  // requests that burned anonymous rate limit. The hook now waits.
  it('does not fetch until auth is resolved, then fetches on the flip', async () => {
    await act(() => useStore.setState({isAuthResolved: false}))
    const {result} = renderHook(() => useVersions(TEST_PARAMS))
    expect(result.current.loading).toBe(false)
    expect(result.current.commits).toEqual([])

    await act(() => useStore.setState({isAuthResolved: true}))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.commits.length).toEqual(MOCK_COMMITS.data.length)
  })
})


const TEST_PARAMS = {
  repository: {name: 'testrepo', orgName: 'testowner'},
  filePath: '',
  accessToken: '',
}
