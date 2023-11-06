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

  it('should render clear button when a selected element is present', async () => {
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

  it('should render and trigger Hide button when a selected element is present and not in Isolate mode', () => {
    const {getByTitle} = render(
        <ShareMock
          initialEntries={['/v/p/index.ifc#p:x']}
        >
          <ElementGroup deselectItems={deselectItems} viewer={viewerMock}/>
        </ShareMock>,
    )
    const hideButton = getByTitle('Hide')
    fireEvent.click(hideButton)
    expect(viewerMock.isolator.hideSelectedElements).toHaveBeenCalled()
  })

  it('should toggle the isolation mode when Isolate button is clicked', () => {
    const {getByTitle} = render(
        <ShareMock initialEntries={['/v/p/index.ifc#p:x']}>
          <ElementGroup deselectItems={deselectItems} viewer={viewerMock}/>
        </ShareMock>,
    )
    const isolateButton = getByTitle('Isolate')
    fireEvent.click(isolateButton)
    expect(viewerMock.isolator.toggleIsolationMode).toHaveBeenCalled()
    // You can also check for the `isIsolate` state update here using another render cycle, but it might be complex.
  })

  it('should trigger unHideAllElements when Show all button is clicked', () => {
    const {getByTitle} = render(
        <ShareMock initialEntries={['/v/p/index.ifc#p:x']}>
          <ElementGroup deselectItems={deselectItems} viewer={viewerMock}/>
        </ShareMock>,
    )
    const hideButton = getByTitle('Hide')
    fireEvent.click(hideButton)
    const showAllButton = getByTitle('Show all')
    fireEvent.click(showAllButton)
    expect(viewerMock.isolator.unHideAllElements).toHaveBeenCalled()
  })

  it('should trigger hideSelectedElements when Hide button is clicked', () => {
    const {getByTitle} = render(
        <ShareMock initialEntries={['/v/p/index.ifc#p:x']}>
          <ElementGroup deselectItems={deselectItems} viewer={viewerMock}/>
        </ShareMock>,
    )
    const hideButton = getByTitle('Hide')
    fireEvent.click(hideButton)
    expect(viewerMock.isolator.hideSelectedElements).toHaveBeenCalled()
  })

  it('should trigger deselectItems prop function when Clear button is clicked', () => {
    const {getByTitle} = render(
        <ShareMock initialEntries={['/v/p/index.ifc#p:x']}>
          <ElementGroup deselectItems={deselectItems} viewer={viewerMock}/>
        </ShareMock>,
    )
    const clearButton = getByTitle('Clear')
    fireEvent.click(clearButton)
    expect(deselectItems).toHaveBeenCalled()
  })
})
