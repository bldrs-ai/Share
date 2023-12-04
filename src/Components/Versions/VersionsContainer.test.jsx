import React from 'react'
import ShareMock from '../../ShareMock'
import {render, renderHook, act} from '@testing-library/react'
import VersionsContainer from './VersionsContainer'
import {
  MOCK_MODEL_PATH_GIT,
  MOCK_REPOSITORY,
  MOCK_COMMITS,
} from '../../utils/GitHub'
import useStore from '../../store/useStore'


jest.mock('../../utils/GitHub', () => ({
  getCommitsForBranch: jest.fn(() => Promise.resolve([
    MOCK_COMMITS,
  ])),
}))

describe('VersionsContainer', () => {
  it('renders the panel', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setModelPath(MOCK_MODEL_PATH_GIT)
      result.current.setRepository(MOCK_REPOSITORY)
    })
    const {getByText} = render(
        <ShareMock>
          <VersionsContainer branch="main"/>
        </ShareMock>,
    )
    const dialogTitle = getByText('Versions')
    expect(dialogTitle).toBeInTheDocument()
  })
})
