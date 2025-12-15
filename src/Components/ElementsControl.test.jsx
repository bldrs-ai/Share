import React from 'react'
import {__getIfcViewerAPIExtendedMockSingleton} from 'web-ifc-viewer'
import {act, render, fireEvent, renderHook} from '@testing-library/react'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import ElementsControl from './ElementsControl'


describe('ElementsControl', () => {
  let deselectItems
  let viewer

  beforeAll(async () => {
    deselectItems = jest.fn()
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

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should render CutPlaneMenu component when isIsolate is false', () => {
    const {queryByTitle} = render(
      <ShareMock initialEntries={['/v/p/index.ifc#p:x']}>
        <ElementsControl deselectItems={deselectItems}/>
      </ShareMock>,
    )
    const cutPlaneMenuButton = queryByTitle('Section')
    expect(cutPlaneMenuButton).toBeInTheDocument()
  })

  it('should render clear button when a selected element is present', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setSelectedElement({id: 123})
    })
    const {queryByTitle} = render(
      <ShareMock initialEntries={['/v/p/index.ifc#p:x']}>
        <ElementsControl deselectItems={deselectItems}/>
      </ShareMock>,
    )
    const clearButton = queryByTitle('Clear')
    expect(clearButton).toBeInTheDocument()
    fireEvent.click(clearButton)
    expect(deselectItems).toHaveBeenCalled()
  })

  it('render and trigger Hide button with selected element and not in Isolate mode', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setSelectedElement({id: 123})
    })
    const {getByTitle} = render(
      <ShareMock initialEntries={['/v/p/index.ifc#p:x']}>
        <ElementsControl deselectItems={deselectItems}/>
      </ShareMock>,
    )
    const hideButton = getByTitle('Hide')
    fireEvent.click(hideButton)
    expect(viewer.isolator.hideSelectedElements).toHaveBeenCalled()
  })

  it('should toggle the isolation mode when Isolate button is clicked', () => {
    const {getByTitle} = render(
      <ShareMock initialEntries={['/v/p/index.ifc#p:x']}>
        <ElementsControl deselectItems={deselectItems}/>
      </ShareMock>,
    )
    const isolateButton = getByTitle('Isolate')
    fireEvent.click(isolateButton)
    expect(viewer.isolator.toggleIsolationMode).toHaveBeenCalled()
  })

  it('should trigger unHideAllElements when Show all button is clicked', () => {
    const {getByTitle} = render(
      <ShareMock initialEntries={['/v/p/index.ifc#p:x']}>
        <ElementsControl deselectItems={deselectItems}/>
      </ShareMock>,
    )
    const hideButton = getByTitle('Hide')
    fireEvent.click(hideButton)
    const showAllButton = getByTitle('Show all')
    fireEvent.click(showAllButton)
    expect(viewer.isolator.unHideAllElements).toHaveBeenCalled()
  })

  it('should trigger hideSelectedElements when Hide button is clicked', () => {
    const {getByTitle} = render(
      <ShareMock initialEntries={['/v/p/index.ifc#p:x']}>
        <ElementsControl deselectItems={deselectItems}/>
      </ShareMock>,
    )
    const hideButton = getByTitle('Hide')
    fireEvent.click(hideButton)
    expect(viewer.isolator.hideSelectedElements).toHaveBeenCalled()
  })
})
