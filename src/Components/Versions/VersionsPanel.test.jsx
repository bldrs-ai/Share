import React from 'react'
import {render, renderHook, act} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import {
  MOCK_MODEL_PATH_GIT,
  MOCK_REPOSITORY,
} from '../../utils/GitHub'
import VersionsPanel from './VersionsPanel'


describe('VersionsPanel', () => {
  it('renders the panel', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setModelPath(MOCK_MODEL_PATH_GIT)
      result.current.setRepository(MOCK_REPOSITORY)
    })
    const {getByText} = render(<VersionsPanel filePath="/ZGRAGGEN.ifc" currentRef={'main'}/>, {wrapper: ShareMock})
    const dialogTitle = getByText('Versions')
    expect(dialogTitle).toBeInTheDocument()
  })
})
