import React from 'react'
import {render, act, fireEvent} from '@testing-library/react'
import ShareMock from '../ShareMock'
import {MockViewer, newMockStringValueElt} from '../utils/IfcMock.test'
import NavTree from './NavTree'


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
  test('NavTree for single element', () => {
    const testLabel = 'Test node label'
    const {getByText} = render(
        <ShareMock>
          <NavTree
            viewer={new MockViewer}
            element={newMockStringValueElt(testLabel)}
          />
        </ShareMock>)
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
