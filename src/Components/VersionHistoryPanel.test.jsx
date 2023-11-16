import React from 'react'
import ShareMock from '../ShareMock'
import {render, renderHook, act, waitFor} from '@testing-library/react'
import VersionHistoryPanel from './VersionHistoryPanel'
import {getCommitsForBranch} from '../utils/GitHub'
import {
  MOCK_MODEL_PATH_GIT,
  MOCK_REPOSITORY,
  MOCK_COMMITS,
} from '../utils/GitHub'
import useStore from '../store/useStore'


jest.mock('../utils/GitHub', () => ({
  getCommitsForBranch: jest.fn(() => Promise.resolve([
    MOCK_COMMITS,
  ])),
}))

describe('VersionsHistoryPanel', () => {
  it('fetches commits on mount', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setModelPath(MOCK_MODEL_PATH_GIT)
      result.current.setRepository(MOCK_REPOSITORY)
    })
    getCommitsForBranch.mockResolvedValueOnce(MOCK_COMMITS)
    render(
        <ShareMock>
          <VersionHistoryPanel branch="main"/>
        </ShareMock>,
    )
    await waitFor(() => {
      expect(getCommitsForBranch).toHaveBeenCalled()
    })
  })
})
