import React from 'react'
import {act, render, fireEvent, renderHook} from '@testing-library/react'
import ElementGroup from './ElementGroup'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import {__getIfcViewerAPIExtendedMockSingleton} from 'web-ifc-viewer'


describe('ElementGroup', () => {
  jest.mock('../store/useStore')
  const viewer = __getIfcViewerAPIExtendedMockSingleton()
  const viewerMock = {
    isolator: {
      toggleIsolationMode: jest.fn(),
      hideSelectedElements: jest.fn(),
      unHideAllElements: jest.fn(),
    },
  }
  const deselectItems = jest.fn()

  it('should render CutPlaneMenu component when isIsolate is false', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setViewer(viewer)
    })
    const {queryByTitle} = render(
        <ShareMock
          initialEntries={['/v/p/index.ifc#p:x']}
        >
          <ElementGroup deselectItems={deselectItems} viewer={viewerMock}/>
        </ShareMock>,
    )
    const cutPlaneMenuButton = queryByTitle('Section')
    expect(cutPlaneMenuButton).toBeInTheDocument()
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
          <ElementGroup deselectItems={deselectItems} viewer={viewerMock}/>
        </ShareMock>,
    )
    const propertiesButton = queryByTitle('Properties')
    fireEvent.click(propertiesButton)
    expect(propertiesButton).toBeInTheDocument()
  })

  it('should render and trigger Isolate button when a selected element is present', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setSelectedElement({id: 123})
    })
    const {queryByTitle} = render(
        <ShareMock
          initialEntries={['/v/p/index.ifc#p:x']}
        >
          <ElementGroup deselectItems={deselectItems} viewer={viewerMock}/>
        </ShareMock>,
    )
    const clearButton = queryByTitle('Clear')
    fireEvent.click(clearButton)
    expect(clearButton).toBeInTheDocument()
  })
})
