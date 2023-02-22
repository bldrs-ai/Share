import React from 'react'
import {act, render, renderHook, fireEvent} from '@testing-library/react'
import useStore from '../store/useStore'
import ShareMock from '../ShareMock'
import {newMockStringValueElt} from '../utils/IfcMock.test'
import NavTree from './NavTree'
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

describe('NavTree', () => {
  it('NavTree for single element', async () => {
    const testLabel = 'Test node label'
    const {result} = renderHook(() => useStore((state) => state))
    const viewer = new IfcViewerAPIExtended()
    await act(() => {
      result.current.setViewerStore(viewer)
    })
    const {getByText} = render(
        <ShareMock>
          <NavTree
            element={newMockStringValueElt(testLabel)}
          />
        </ShareMock>)
    await actAsyncFlush()
    expect(getByText(testLabel)).toBeInTheDocument()
  })

  it('should select element on click', async () => {
    const selectElementsMock = jest.fn()
    const testLabel = 'Test node label'
    const ifcElementMock = newMockStringValueElt(testLabel)
    const {getByText} = render(
        <NavTree
          element={ifcElementMock}
          pathPrefix={'/share/v/p/index.ifc'}
          selectWithShiftClickEvents={selectElementsMock}
        />)
    const root = await getByText(testLabel)
    expect(getByText(testLabel)).toBeInTheDocument()
    await act(async () => {
      await fireEvent.click(root)
    })
    expect(selectElementsMock).toHaveBeenLastCalledWith(false, 1)
    await act(async () => {
      await fireEvent.click(root, {shiftKey: true})
    })
    expect(selectElementsMock).toHaveBeenLastCalledWith(true, 1)
  })
})
