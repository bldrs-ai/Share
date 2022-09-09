import React from 'react'
import {act, fireEvent, render, renderHook} from '@testing-library/react'
import CutPlaneMenu from './CutPlaneMenu'
import ShareMock from '../ShareMock'
import {makeTestTree} from '../utils/TreeUtils.test'
import useStore from '../store/useStore'
import {__getIfcViewerAPIMockSingleton} from 'web-ifc-viewer'


describe('CutPlane', () => {
  it('Section Button', () => {
    const {getByTitle, debug} = render(<ShareMock><CutPlaneMenu/></ShareMock>)
    debug()
    expect(getByTitle('Section')).toBeInTheDocument()
  })

  it('Section Menu', () => {
    const {getByTitle, getByText, debug} = render(<ShareMock><CutPlaneMenu/></ShareMock>)
    const sectionButton = getByTitle('Section')
    fireEvent.click(sectionButton)
    debug()
    expect(getByText('X')).toBeInTheDocument()
    expect(getByText('Y')).toBeInTheDocument()
    expect(getByText('Z')).toBeInTheDocument()
  })

  it('X Section', async () => {
    const {getByTitle, getByText, debug} = render(<ShareMock><CutPlaneMenu/></ShareMock>)
    const sectionButton = getByTitle('Section')
    const {result} = renderHook(() => useStore((state) => state))
    const viewer = __getIfcViewerAPIMockSingleton()
    await act(() => {
      result.current.setViewerStore(viewer)
      result.current.toggleIsPropertiesOn()
    })
    fireEvent.click(sectionButton)
    const xDirection = getByText('X')
    fireEvent.click(xDirection)
    debug()
    const callDeletePlanes = viewer.clipper.deleteAllPlanes.mock.calls
    console.log('callDeletePlanes', callDeletePlanes)
    // expect(getByText('X')).toBeInTheDocument()
    // expect(getByText('Y')).toBeInTheDocument()
    // expect(getByText('Z')).toBeInTheDocument()
  })
})

