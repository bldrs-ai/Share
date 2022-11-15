import React from 'react'
import {act, fireEvent, render, renderHook} from '@testing-library/react'
import CutPlaneMenu from './CutPlaneMenu'
import CadView from '../Containers/CadView'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import {__getIfcViewerAPIMockSingleton} from 'web-ifc-viewer'


describe('CutPlane', () => {
  it('Section Button', () => {
    const {getByTitle} = render(<ShareMock><CutPlaneMenu/></ShareMock>)
    expect(getByTitle('Section')).toBeInTheDocument()
  })

  it('Section Menu', () => {
    const {getByTitle, getByText} = render(<ShareMock><CutPlaneMenu/></ShareMock>)
    const sectionButton = getByTitle('Section')
    fireEvent.click(sectionButton)
    expect(getByText('X')).toBeInTheDocument()
    expect(getByText('Y')).toBeInTheDocument()
    expect(getByText('Z')).toBeInTheDocument()
  })

  it('X Section', async () => {
    const {getByTitle, getByText} = render(<ShareMock><CutPlaneMenu/></ShareMock>)
    const sectionButton = getByTitle('Section')
    const {result} = renderHook(() => useStore((state) => state))
    const viewer = __getIfcViewerAPIMockSingleton()
    await act(() => {
      result.current.setViewerStore(viewer)
    })
    fireEvent.click(sectionButton)
    const xDirection = getByText('X')
    fireEvent.click(xDirection)
    const callDeletePlanes = viewer.clipper.deleteAllPlanes.mock.calls
    const callCreatePlanes = viewer.clipper.deleteAllPlanes.mock.calls
    expect(callDeletePlanes.length).toBe(1)
    expect(callCreatePlanes.length).toBe(1)
  })

  it('X Section in URL', async () => {
    render(
        <ShareMock
          initialEntries={['/v/p/index.ifc#p:x']}
        >
          <CutPlaneMenu/>
        </ShareMock>)
    const {result} = renderHook(() => useStore((state) => state))
    const viewer = __getIfcViewerAPIMockSingleton()
    await act(() => {
      result.current.setViewerStore(viewer)
    })
    const callDeletePlanes = viewer.clipper.deleteAllPlanes.mock.calls
    const callCreatePlanes = viewer.clipper.deleteAllPlanes.mock.calls
    expect(callDeletePlanes.length).toBe(1)
    expect(callCreatePlanes.length).toBe(1)
  })

  it('X Section in URL', async () => {
    render(
        <ShareMock
          initialEntries={['/v/p/index.ifc#p:x']}
        >
          <CutPlaneMenu/>
        </ShareMock>)
    const {result} = renderHook(() => useStore((state) => state))
    const viewer = __getIfcViewerAPIMockSingleton()
    await act(() => {
      result.current.setViewerStore(viewer)
    })
    const callDeletePlanes = viewer.clipper.deleteAllPlanes.mock.calls
    const callCreatePlanes = viewer.clipper.deleteAllPlanes.mock.calls
    expect(callDeletePlanes.length).toBe(1)
    expect(callCreatePlanes.length).toBe(1)
  })

  it('Plane offset', async () => {
    const {getByTitle, getByText} = render(
        <ShareMock
          initialEntries={['/v/p/index.ifc#c:-136.31,37.98,62.86,-43.48,15.73,-4.34::p:y,14']}
        >
          <CadView/>
        </ShareMock>)
    const {result} = renderHook(() => useStore((state) => state))
    const viewer = __getIfcViewerAPIMockSingleton()
    await act(() => {
      result.current.setViewerStore(viewer)
    })
    const shareButton = getByTitle('Share')
    fireEvent.click(shareButton)
    expect(getByText('Camera position')).toBeInTheDocument()
  })
})

