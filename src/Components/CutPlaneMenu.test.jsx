import React from 'react'
import {act, fireEvent, render, renderHook} from '@testing-library/react'
import CutPlaneMenu, {getPlanes} from './CutPlaneMenu'
import ShareControl from './ShareControl'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import model from '../__mocks__/MockModel.js'
import {__getIfcViewerAPIExtendedMockSingleton} from 'web-ifc-viewer'


jest.mock('three')


describe('CutPlaneMenu', () => {
  it('Section Button', () => {
    const {getByTitle} = render(<ShareMock><CutPlaneMenu/></ShareMock>)
    expect(getByTitle('Section')).toBeInTheDocument()
  })


  it('Section Menu', () => {
    const {getByTitle, getByText} = render(<ShareMock><CutPlaneMenu/></ShareMock>)
    const sectionButton = getByTitle('Section')
    fireEvent.click(sectionButton)
    expect(getByText('X - Section')).toBeInTheDocument()
    expect(getByText('Y - Plan')).toBeInTheDocument()
    expect(getByText('Z - Section')).toBeInTheDocument()
  })


  it('X Section', async () => {
    const {getByTitle, getByText} = render(<ShareMock><CutPlaneMenu/></ShareMock>)
    const sectionButton = getByTitle('Section')
    const {result} = renderHook(() => useStore((state) => state))
    const viewer = __getIfcViewerAPIExtendedMockSingleton()
    await act(() => {
      result.current.setViewerStore(viewer)
    })
    fireEvent.click(sectionButton)
    const xDirection = getByText('X - Section')
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
    const viewer = __getIfcViewerAPIExtendedMockSingleton()
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
    const viewer = __getIfcViewerAPIExtendedMockSingleton()
    await act(() => {
      result.current.setViewerStore(viewer)
    })
    const shareButton = getByTitle('Share')
    fireEvent.click(shareButton)
    expect(getByText('Cutplane position')).toBeInTheDocument()
  })


  it('Plane Offset is correct', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const viewer = __getIfcViewerAPIExtendedMockSingleton()
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


  it('getPlanes handles many combinations', () => {
    const check = (actualPlanes, expectPlanes) => {
      expect(actualPlanes.length).toBe(expectPlanes.length)
      for (let i = 0; i < expectPlanes.length; i++) {
        const actualPlane = actualPlanes[i]
        const expectPlane = expectPlanes[i]
        expect(actualPlane.direction).toBe(expectPlane[0])
        expect(actualPlane.offset).toBe(expectPlane[1])
      }
    }

    /* eslint-disable no-magic-numbers */
    check(getPlanes(''), [])
    check(getPlanes('p:x=1'), [['x', 1]])
    check(getPlanes('p:y=2'), [['y', 2]])
    check(getPlanes('p:z=3'), [['z', 3]])
    check(getPlanes('p:x=1,y=4'), [['x', 1], ['y', 4]])
    check(getPlanes('p:x=2,z=5'), [['x', 2], ['z', 5]])
    check(getPlanes('p:y=3,z=6'), [['y', 3], ['z', 6]])
    check(getPlanes('p:x=0,y=1.11111,z=2.22222'), [['x', 0], ['y', 1.111], ['z', 2.222]])
    /* eslint-enable no-magic-numbers */
  })
})
