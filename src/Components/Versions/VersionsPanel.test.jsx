import React from 'react'
import {act, fireEvent, render, renderHook, waitFor} from '@testing-library/react'
import {handleRoute} from '../../routes/routes'
import {StoreRouteThemeCtx} from '../../Share.fixture'
import useStore from '../../store/useStore'
import {navigateToModel} from '../../utils/navigate'
import VersionsPanel from './VersionsPanel'
import {
  MOCK_MODEL_PATH_GIT,
  MOCK_REPOSITORY,
} from './VersionsPanel.fixture'
import {VERSIONS_TITLE} from './component'
import useVersions from './useVersions'
import {MOCK_COMMITS} from './VersionsTimeline.fixture'


jest.mock('./useVersions')
jest.mock('../../utils/navigate', () => ({
  ...jest.requireActual('../../utils/navigate'),
  navigateToModel: jest.fn(),
}))


describe('VersionsPanel', () => {
  it('renders the panel', async () => {
    // Simulated hook state
    let mockCommitsState = {
      commits: [],
      loading: true,
    }

    // Mock useCommits to return the current state
    useVersions.mockImplementation(() => mockCommitsState)

    // Also setup store state
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setAccessToken('')
      result.current.setIsVersionsVisible(true)
      result.current.setRepository(MOCK_REPOSITORY.orgName, MOCK_REPOSITORY.name)
      result.current.setModelPath(MOCK_MODEL_PATH_GIT)
    })

    // Render the component
    const {getByText, rerender} = render(
      <VersionsPanel filePath='/test.ifc' currentRef='main'/>,
      {wrapper: StoreRouteThemeCtx},
    )

    // Ensure loading state is rendered initially
    await waitFor(() => {
      expect(getByText('Versions')).toBeInTheDocument()
    })

    // Transition the state
    mockCommitsState = {
      commits: MOCK_COMMITS,
      loading: false,
    }

    // Re-render to simulate the state update
    rerender(
      <VersionsPanel filePath='/test.ifc' currentRef='main'/>,
      {wrapper: StoreRouteThemeCtx})

    // Wait for the updated state to be rendered
    await waitFor(() => {
      expect(getByText(VERSIONS_TITLE)).toBeInTheDocument()
    })
    MOCK_COMMITS.forEach((commit) => {
      expect(getByText(commit.authorName)).toBeInTheDocument()
      expect(getByText(commit.commitDate)).toBeInTheDocument()
      expect(getByText(commit.commitMessage)).toBeInTheDocument()
    })
  })

  // A GitHub route result's filepath has no leading slash (routes/github.ts),
  // and the commit's link lost the slash between the sha and the file
  // (open-205's surface E2E, #2021).
  it('opens a commit at the route\'s own file, with a slash between the sha and the path', async () => {
    useVersions.mockImplementation(() => ({
      commits: MOCK_COMMITS.map((commit, i) => ({...commit, sha: `sha${i}`})),
      loading: false,
    }))
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setModelPath(handleRoute('/share/v/gh', {
        'org': 'acme', 'repo': 'tower', 'branch': 'main', '*': 'models/tower.ifc',
      }))
    })
    const {getByText} = render(
      <VersionsPanel filePath='models/tower.ifc' currentRef='main'/>,
      {wrapper: StoreRouteThemeCtx})
    fireEvent.click(getByText(MOCK_COMMITS[1].commitMessage))
    expect(navigateToModel).toHaveBeenCalledWith(
      {pathname: '/share/v/gh/acme/tower/sha1/models/tower.ifc'}, expect.any(Function))
  })
})
