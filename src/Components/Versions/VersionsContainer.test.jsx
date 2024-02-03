import React from 'react'
import {render, renderHook, act} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import {
  MOCK_MODEL_PATH_GIT,
  MOCK_REPOSITORY,
} from '../../utils/GitHub'
import VersionsContainer from './VersionsContainer'


describe('VersionsContainer', () => {
  it('renders the panel', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setModelPath(MOCK_MODEL_PATH_GIT)
      result.current.setRepository(MOCK_REPOSITORY)
    })
    const {getByText} = render(
        <ShareMock>
          <VersionsContainer filePath="/ZGRAGGEN.ifc" currentRef={'main'}/>
        </ShareMock>,
    )
    const dialogTitle = getByText('Versions')
    expect(dialogTitle).toBeInTheDocument()
  })
})
