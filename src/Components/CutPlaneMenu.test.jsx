import React from 'react'
import {act, fireEvent, render, renderHook} from '@testing-library/react'
import CutPlaneMenu, {getPlanes} from './CutPlaneMenu'
import ShareControl from './ShareControl'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import model from '../__mocks__/MockModel.js'
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
    const callCreatePlanes = viewer.clipper.createFromNormalAndCoplanarPoint.mock.calls
    expect(callCreatePlanes.length).toBe(1)
    fireEvent.click(xDirection)
    const callDeletePlanes = viewer.clipper.deleteAllPlanes.mock.calls
    expect(callDeletePlanes.length).toBe(1)
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
    const callCreatePlanes = viewer.clipper.createFromNormalAndCoplanarPoint.mock.calls
    expect(callCreatePlanes.length).toBe(1)
  })

  it('Plane in the scene', async () => {
    const {getByTitle, getByText} = render(
        <ShareMock>
          <ShareControl/>
        </ShareMock>)
    const {result} = renderHook(() => useStore((state) => state))
    // mock contains one plane
    const viewer = __getIfcViewerAPIMockSingleton()
    await act(() => {
      result.current.setViewerStore(viewer)
    })
    const shareButton = getByTitle('Share')
    fireEvent.click(shareButton)
    expect(getByText('Cutplane position')).toBeInTheDocument()
  })

  it('Plane Offset is correct', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const viewer = __getIfcViewerAPIMockSingleton()
    await act(() => {
      result.current.setViewerStore(viewer)
      result.current.setModelStore(model)
    })
    render(
        <ShareMock
          initialEntries={['/v/p/index.ifc#c:-136.31,37.98,62.86,-43.48,15.73,-4.34::p:y=14']}
        >
          <CutPlaneMenu/>
        </ShareMock>)
    expect(result.current.cutPlanes[0].direction).toBe('y')
    // eslint-disable-next-line no-magic-numbers
    expect(result.current.cutPlanes[0].offset).toBe(14)
  })

  it('Get planes info from plane hash string', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const viewer = __getIfcViewerAPIMockSingleton()
    await act(() => {
      result.current.setViewerStore(viewer)
      result.current.setModelStore(model)
    })
    render(
        <ShareMock
          initialEntries={['/v/p/index.ifc#c:-136.31,37.98,62.86,-43.48,15.73,-4.34::p:y=14']}
        >
          <CutPlaneMenu/>
        </ShareMock>)
    const planes = getPlanes('p:0,1,x=0,y=1.11111,z=2.22222')
    // eslint-disable-next-line no-magic-numbers
    expect(planes.length).toBe(3)
    expect(planes[0].direction).toBe('x')
    expect(planes[0].offset).toBe(0)
    expect(planes[1].direction).toBe('y')
    // eslint-disable-next-line no-magic-numbers
    expect(planes[1].offset).toBe(1.111)
    expect(planes[2].direction).toBe('z')
    // eslint-disable-next-line no-magic-numbers
    expect(planes[2].offset).toBe(2.222)
  })
})
