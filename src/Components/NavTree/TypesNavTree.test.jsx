import React from 'react'
import {act, render, renderHook} from '@testing-library/react'
import {IfcViewerAPIExtended} from '../../Infrastructure/IfcViewerAPIExtended'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import {newMockTypes} from '../../utils/IfcMock.test'
import {actAsyncFlush} from '../../utils/tests'
import TypesNavTree from './TypesNavTree'


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
            keyId='test'
            model={{
              getIfcType: jest.fn(),
            }}
            pathPrefix={'/share/v/p/index.ifc'}
            types={newMockTypes(testLabel, testType)}
            selectWithShiftClickEvents={jest.fn()}
            idToRef={{}}
          />
        </ShareMock>)
    await actAsyncFlush()
    expect(getByText(testType)).toBeInTheDocument()
  })
})
