import {act, renderHook, waitFor} from '@testing-library/react'
import {MOCK_COMMITS} from '../net/github/Commits.fixture'
import useStore from '../store/useStore'
import {addRecentFileEntry, loadRecentFilesBySource} from './persistence'
import useGithubLastModified from './useGithubLastModified'


const COMMIT_DATE = MOCK_COMMITS.data[0].commit.author.date
const MOCK_MODEL_PATH = {org: 'testowner', repo: 'testrepo', filepath: 'model.ifc'}
const SHARE_PATH = '/share/v/gh/testowner/testrepo/main/model.ifc'
const ASYNC_SETTLE_MS = 100


describe('useGithubLastModified', () => {
  beforeEach(async () => {
    localStorage.clear()
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setRepository('testowner', 'testrepo')
      result.current.setAccessToken('')
    })
  })

  it('back-fills lastModifiedUtc from the latest commit date', async () => {
    addRecentFileEntry({id: SHARE_PATH, source: 'github', name: 'model.ifc', lastModifiedUtc: null})

    renderHook(() => useGithubLastModified(MOCK_MODEL_PATH, 'main'))

    await waitFor(() => {
      const [entry] = loadRecentFilesBySource('github')
      expect(entry.lastModifiedUtc).toBe(new Date(COMMIT_DATE).getTime())
    })
  })

  it('does not update when modelPath is null', async () => {
    addRecentFileEntry({id: SHARE_PATH, source: 'github', name: 'model.ifc', lastModifiedUtc: null})

    renderHook(() => useGithubLastModified(null, 'main'))

    await new Promise((resolve) => setTimeout(resolve, ASYNC_SETTLE_MS))
    const [entry] = loadRecentFilesBySource('github')
    expect(entry.lastModifiedUtc).toBeNull()
  })

  it('does not update when branch is missing', async () => {
    addRecentFileEntry({id: SHARE_PATH, source: 'github', name: 'model.ifc', lastModifiedUtc: null})

    renderHook(() => useGithubLastModified(MOCK_MODEL_PATH, ''))

    await new Promise((resolve) => setTimeout(resolve, ASYNC_SETTLE_MS))
    const [entry] = loadRecentFilesBySource('github')
    expect(entry.lastModifiedUtc).toBeNull()
  })
})
