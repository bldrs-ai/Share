import React from 'react'
import {act, render, renderHook} from '@testing-library/react'
import useStore from '../store/useStore'
import ShareMock from '../ShareMock'
import {newMockTypes} from '../utils/IfcMock.test'
import TypesNavTree from './TypesNavTree'
import {IfcViewerAPIExtended} from '../Infrastructure/IfcViewerAPIExtended'
import {actAsyncFlush} from '../utils/tests'


jest.mock('@mui/lab/TreeItem', () => {
  const original = jest.requireActual('@mui/lab/TreeItem')
  return {
    __esModule: true,
    ...original,
    useTreeItem: jest.fn().mockReturnValue({
      disabled: false,
      expanded: false,
      selected: false,
      focused: false,
      handleExpansion: jest.fn(),
      handleSelection: jest.fn(),
    }),
  }
})

describe('TypesNavTree', () => {
  it('Can render single type', async () => {
    const testLabel = 'Test node label'
    const testType = 'Test Type'
    const {result} = renderHook(() => useStore((state) => state))
    const viewer = new IfcViewerAPIExtended()
    await act(() => {
      result.current.setViewer(viewer)
    })
    const {getByText} = render(
        <ShareMock>
          <TypesNavTree
            types={newMockTypes(testLabel, testType)}
          />
        </ShareMock>)
    await actAsyncFlush()
    expect(getByText(testType)).toBeInTheDocument()
  })
})
