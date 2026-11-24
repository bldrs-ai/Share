import {act, renderHook, waitFor} from '@testing-library/react'
import useStore from '../../store/useStore'
import useVersions from './useVersions'
import {MOCK_COMMITS} from '../../net/github/Commits.fixture'


describe('useVersions', () => {
  it('fetches and returns commits once auth is resolved', async () => {
    await act(() => useStore.setState({isAuthResolved: true}))
    const {result} = renderHook(() => useVersions(TEST_PARAMS))
    // renderHook runs the effect inside act, so the fetch is already in
    // flight here: check `loading` now rather than wait for it.
    expect(result.current.loading).toBe(true)
    await waitForCommits(result)
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

    // No `loading === true` check here, unlike above: this act is awaited,
    // so it drains microtasks, and a fast (cached) fetch can already be done
    // by the time it returns.
    await act(() => useStore.setState({isAuthResolved: true}))
    await waitForCommits(result)
  })
})


/**
 * Wait for the fetch to finish with the fixture's commits. It waits on the
 * outcome (commits in, loading off) in one check, with more than
 * Testing Library's default 1 s: the mocked request goes through Octokit
 * and the GitHub cache, and under the full suite's load it once took
 * longer than 1 s (Share#2308).
 *
 * @param {object} result renderHook's result
 */
async function waitForCommits(result) {
  await waitFor(() => {
    expect(result.current.commits.length).toEqual(MOCK_COMMITS.data.length)
    expect(result.current.loading).toBe(false)
  }, {timeout: FETCH_TIMEOUT_MS})
}


const FETCH_TIMEOUT_MS = 5000

const TEST_PARAMS = {
  repository: {name: 'testrepo', orgName: 'testowner'},
  filePath: '',
  accessToken: '',
}
