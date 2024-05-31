import React from 'react'
import {__getIfcViewerAPIExtendedMockSingleton} from 'web-ifc-viewer'
import {act, fireEvent, render, renderHook} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import model from '../../__mocks__/MockModel.js'
import ShareControl from '../Share/ShareControl'
import CutPlaneMenu, {getPlanes} from './CutPlaneMenu'
import {HASH_PREFIX_CUT_PLANE} from './hashState'


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
    expect(getByText('Section')).toBeInTheDocument()
    expect(getByText('Plan')).toBeInTheDocument()
    expect(getByText('Elevation')).toBeInTheDocument()
  })


  it('X Section', async () => {
    const {getByTitle, getByText} = render(<ShareMock><CutPlaneMenu/></ShareMock>)
    const sectionButton = getByTitle('Section')
    const {result} = renderHook(() => useStore((state) => state))
    const viewer = __getIfcViewerAPIExtendedMockSingleton()
    await act(() => {
      result.current.setViewer(viewer)
    })
    fireEvent.click(sectionButton)
    const xDirection = getByText('Section')
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
          initialEntries={[`/v/p/index.ifc#${HASH_PREFIX_CUT_PLANE}:x`]}
        >
          <CutPlaneMenu/>
        </ShareMock>)
    const {result} = renderHook(() => useStore((state) => state))
    const viewer = __getIfcViewerAPIExtendedMockSingleton()
    await act(() => {
      result.current.setViewer(viewer)
    })
    const callCreatePlanes = viewer.clipper.createFromNormalAndCoplanarPoint.mock.calls
    expect(callCreatePlanes.length).toBe(1)
  })


  it('Plane in the scene', async () => {
    const {getByTestId, getByText, getByTitle} = render(
        <ShareMock>
          <CutPlaneMenu/>
          <ShareControl/>
        </ShareMock>)
    const {result} = renderHook(() => useStore((state) => state))
    // mock contains one plane
    const viewer = __getIfcViewerAPIExtendedMockSingleton()
    await act(() => {
      result.current.setViewer(viewer)
    })
    const cutPlaneButton = getByTestId('control-button-cut-plane')
    fireEvent.click(cutPlaneButton)

    const planItem = getByTestId('menu-item-plan')
    fireEvent.click(planItem)

    const shareButton = getByTitle('Share')
    fireEvent.click(shareButton)
    expect(getByText('Cutplane position')).toBeInTheDocument()
  })


  // TODO(pablo): not sure why this is failing.  Works when full stood up.
  it.skip('Plane Offset is correct', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const viewer = __getIfcViewerAPIExtendedMockSingleton()
    await act(() => {
      result.current.setViewer(viewer)
      result.current.setModel(model)
    })
    const urlSuffix = `/v/p/index.ifc#c:-136.31,37.98,62.86,-43.48,15.73,-4.34;${HASH_PREFIX_CUT_PLANE}:y=14`
    render(
        <ShareMock
          initialEntries={[
            urlSuffix,
          ]}
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

    const pfx = HASH_PREFIX_CUT_PLANE
    /* eslint-disable no-magic-numbers */
    check(getPlanes(''), [])
    check(getPlanes(`${pfx}:x=1`), [['x', 1]])
    check(getPlanes(`${pfx}:y=2`), [['y', 2]])
    check(getPlanes(`${pfx}:z=3`), [['z', 3]])
    check(getPlanes(`${pfx}:x=1,y=4`), [['x', 1], ['y', 4]])
    check(getPlanes(`${pfx}:x=2,z=5`), [['x', 2], ['z', 5]])
    check(getPlanes(`${pfx}:y=3,z=6`), [['y', 3], ['z', 6]])
    check(getPlanes(`${pfx}:x=0,y=1.11111,z=2.22222`), [['x', 0], ['y', 1.111], ['z', 2.222]])
    /* eslint-enable no-magic-numbers */
  })
})
