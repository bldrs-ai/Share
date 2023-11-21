import React from 'react'
import ShareMock from '../ShareMock'
import {render, renderHook, act} from '@testing-library/react'
import VersionHistoryPanel from './VersionHistoryPanel'
import {
  MOCK_MODEL_PATH_GIT,
  MOCK_REPOSITORY,
} from '../utils/GitHub'
import useStore from '../store/useStore'


describe('VersionsHistoryPanel', () => {
  it('renders the panel', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setModelPath(MOCK_MODEL_PATH_GIT)
      result.current.setRepository(MOCK_REPOSITORY)
    })
    const {debug, getByText} = render(
        <ShareMock>
          <VersionHistoryPanel branch="main"/>
        </ShareMock>,
    )
    debug()
    const dialogTitle = getByText('Version History')
    expect(dialogTitle).toBeInTheDocument()
  })
})
