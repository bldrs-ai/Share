import React from 'react'
import {act, render, renderHook,
  fireEvent,
} from '@testing-library/react'
import {IfcViewerAPIExtended} from '../../Infrastructure/IfcViewerAPIExtended'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import NavTreeControl from './NavTreeControl'


describe('NavTree', () => {
  it('NavTree to remain close when an element is selected', async () => {
    const testLabel = 'control-button-navigation'
    const {result} = renderHook(() => useStore((state) => state))
    const viewer = new IfcViewerAPIExtended()
    await act(() => {
      result.current.setViewer(viewer)
      result.current.setSelectedElement({id: 123})
    })
    const {getByTestId} = render(
        <ShareMock>
          <NavTreeControl/>
        </ShareMock>)
    expect(getByTestId(testLabel)).toBeInTheDocument()
    expect(result.current.isNavTreeVisible).toEqual(false)
  })
  it('NavTree to open when nav control button is pressed', async () => {
    const testLabel = 'control-button-navigation'
    const {result} = renderHook(() => useStore((state) => state))
    const viewer = new IfcViewerAPIExtended()
    await act(() => {
      result.current.setViewer(viewer)
      result.current.setSelectedElement({id: 123})
    })
    const {getByTestId} = render(
        <ShareMock>
          <NavTreeControl/>
        </ShareMock>)
    const controlButton = getByTestId(testLabel)
    expect(getByTestId(testLabel)).toBeInTheDocument()
    fireEvent.click(controlButton)
    expect(result.current.isNavTreeVisible).toEqual(true)
  })
})
