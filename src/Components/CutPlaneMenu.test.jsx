import React from 'react'
import {render} from '@testing-library/react'
// import {ifcModel} from '../__mocks__/MockModel.js'
import CutPlaneMenu from './CutPlaneMenu'
import ShareMock from '../ShareMock'


describe('CutPlane', () => {
  // it('model center', () => {
  //   const modelCenter = getModelCenter(ifcModel)
  //   console.log('model center', modelCenter.x)
  // })


  it('Section Button', () => {
    const {getByTitle} = render(<ShareMock><CutPlaneMenu/></ShareMock>)
    expect(getByTitle('Plan')).toBeInTheDocument()
  })

  // it('Section Menu', () => {
  //   const {getByTitle, getByText} = render(<ShareMock><CutPlaneMenu/></ShareMock>)
  //   const planeButton = getByTitle('Plan')
  //   fireEvent.click(planeButton)
  //   expect(getByText('X')).toBeInTheDocument()
  //   expect(getByText('Y')).toBeInTheDocument()
  //   expect(getByText('Z')).toBeInTheDocument()
  // })

  // it('should add the plane offset to the URL hash params if the viewer has planes', () => {
  //   // mock the viewer object with a planes property
  //   const viewer = {
  //     clipper: {
  //       planes: [{}],
  //     },
  //   }
  //   const ifcModel = {}
  //   const planeOffset = {}
  //   // mock the getPlaneOffset function to return a plane offset
  //   getPlaneOffset.mockImplementation(() => planeOffset)
  //   // mock the addHashParams function to return a modified URL
  //   addHashParams.mockImplementation((url, prefix, offset) => `${url}?${prefix}=${offset}`)

  //   const result = addPlaneLocationToUrl(viewer, ifcModel)

  //   expect(result).toBe('?p=${planeOffset}')
  //   expect(getPlaneOffset).toHaveBeenCalledWith(viewer, ifcModel)
  //   expect(addHashParams).toHaveBeenCalledWith(window.location, 'p', planeOffset)
  // })


  // it('X Section in URL', async () => {
  //   render(
  //       <ShareMock
  //         initialEntries={['/v/p/index.ifc#p:x']}
  //       >
  //         <CutPlaneMenu/>
  //       </ShareMock>)
  //   const {result} = renderHook(() => useStore((state) => state))
  //   const viewer = __getIfcViewerAPIMockSingleton()
  //   await act(() => {
  //     result.current.setViewerStore(viewer)
  //   })
  //   const callDeletePlanes = viewer.clipper.deleteAllPlanes.mock.calls
  //   const callCreatePlanes = viewer.clipper.deleteAllPlanes.mock.calls
  //   expect(callDeletePlanes.length).toBe(1)
  //   expect(callCreatePlanes.length).toBe(1)
  // })

  // it('Plane offset', async () => {
  //   const {getByTitle, getByText} = render(
  //       <ShareMock>
  //         <ShareControl/>
  //       </ShareMock>)
  //   const {result} = renderHook(() => useStore((state) => state))
  //   const viewer = __getIfcViewerAPIMockSingleton()
  //   await act(() => {
  //     result.current.setViewerStore(viewer)
  //   })
  //   const shareButton = getByTitle('Share')
  //   fireEvent.click(shareButton)
  //   expect(getByText('Cutplane position')).toBeInTheDocument()
  // })
})

