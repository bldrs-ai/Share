import React from 'react'
import {__getIfcViewerAPIExtendedMockSingleton} from 'web-ifc-viewer'
import {act, render, fireEvent, renderHook} from '@testing-library/react'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import OperationsGroup from './OperationsGroup'


describe('OperationsGroup', () => {
  const deselectItems = jest.fn()
  let viewer

  beforeAll(async () => {
    const {result} = renderHook(() => useStore((state) => state))
    viewer = __getIfcViewerAPIExtendedMockSingleton()
    viewer.isolator = {
      toggleIsolationMode: jest.fn(),
      hideSelectedElements: jest.fn(),
      unHideAllElements: jest.fn(),
    }
    await act(() => {
      result.current.setViewer(viewer)
    })
  })

  it('should render and trigger Properties button when a selected element is present', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setSelectedElement({id: 123})
    })
    const {queryByTitle} = render(
        <ShareMock
          initialEntries={['/v/p/index.ifc#p:x']}
        >
          <OperationsGroup deselectItems={deselectItems}/>
        </ShareMock>,
    )
    const propertiesButton = queryByTitle('Properties')
    fireEvent.click(propertiesButton)
    expect(propertiesButton).toBeInTheDocument()
  })
})
