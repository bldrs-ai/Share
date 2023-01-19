import React, {useState} from 'react'
import {render, renderHook, act, fireEvent, screen, waitFor} from '@testing-library/react'
import {__getIfcViewerAPIMockSingleton} from 'web-ifc-viewer'
import useStore from '../store/useStore'
import ShareMock from '../ShareMock'
import {actAsyncFlush} from '../utils/tests'
import {makeTestTree} from '../utils/TreeUtils.test'
import CadView from './CadView'
import * as AllCadView from './CadView'
import * as reactRouting from 'react-router-dom'


const mockUseDefaultLocationValue = {pathname: '/index.ifc', search: '', hash: '', state: null, key: 'default'}
jest.mock('react-router-dom', () => {
  return {
    ...jest.requireActual('react-router-dom'),
    useLocation: jest.fn(() => mockUseDefaultLocationValue),
  }
})

describe('CadView', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('renders with mock IfcViewerAPI', async () => {
    const modelPath = {
      filepath: `index.ifc`,
    }
    const viewer = __getIfcViewerAPIMockSingleton()
    viewer._loadedModel.ifcManager.getSpatialStructure.mockReturnValueOnce(makeTestTree())
    const {result} = renderHook(() => useState(modelPath))
    render(
        <ShareMock>
          <CadView
            installPrefix={''}
            appPrefix={''}
            pathPrefix={''}
            modelPath={result.current[0]}
          />
        </ShareMock>,
    )
    // Necessary to wait for some of the component to render to avoid
    // act() warnings from testing-library.
    await waitFor(() => screen.getByTitle(/Bldrs: 1.0.0/i))
    await actAsyncFlush()
  })

  it('renders and selects the element ID from URL', async () => {
    const testTree = makeTestTree()
    const targetEltId = testTree.children[0].expressID
    const mockCurrentLocationValue = {pathname: '/index.ifc/1', search: '', hash: '', state: null, key: 'default'}
    reactRouting.useLocation.mockReturnValue(mockCurrentLocationValue)
    const modelPath = {
      filepath: `index.ifc`,
      gitpath: undefined,
    }
    const viewer = __getIfcViewerAPIMockSingleton()
    viewer._loadedModel.ifcManager.getSpatialStructure.mockReturnValueOnce(testTree)
    const {result} = renderHook(() => useState(modelPath))
    render(
        <ShareMock>
          <CadView
            installPrefix={'/'}
            appPrefix={'/'}
            pathPrefix={'/'}
            modelPath={result.current[0]}
          />
        </ShareMock>)
    await waitFor(() => screen.getByTitle(/Bldrs: 1.0.0/i))
    await actAsyncFlush()
    const getPropsCalls = viewer.getProperties.mock.calls
    const numCallsExpected = 2 // First for root, second from URL path
    expect(getPropsCalls.length).toBe(numCallsExpected)
    expect(getPropsCalls[0][0]).toBe(0) // call 1, arg 1
    expect(getPropsCalls[0][1]).toBe(0) // call 1, arg 2
    expect(getPropsCalls[1][0]).toBe(0) // call 2, arg 1
    expect(getPropsCalls[1][1]).toBe(targetEltId) // call 2, arg 2
    await actAsyncFlush()
  })

  it('clear elements and planes on unselect', async () => {
    const testTree = makeTestTree()
    const targetEltId = testTree.children[0].expressID
    const mockCurrentLocationValue = {pathname: '/index.ifc/1', search: '', hash: '', state: null, key: 'default'}
    reactRouting.useLocation.mockReturnValue(mockCurrentLocationValue)
    const modelPath = {
      filepath: `index.ifc`,
      gitpath: undefined,
    }
    const viewer = __getIfcViewerAPIMockSingleton()
    viewer._loadedModel.ifcManager.getSpatialStructure.mockReturnValueOnce(testTree)
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setSelectedElement(targetEltId)
      result.current.setSelectedElements([targetEltId])
      result.current.setCutPlaneDirection('y')
    })
    const {getByTitle} = render(
        <ShareMock>
          <CadView
            installPrefix={'/'}
            appPrefix={'/'}
            pathPrefix={'/'}
            modelPath={modelPath}
          />
        </ShareMock>)
    expect(getByTitle('Section')).toBeInTheDocument()
    const clearSelection = getByTitle('Clear')
    act(() => {
      fireEvent.click(clearSelection)
    })
    const callDeletePlanes = viewer.clipper.deleteAllPlanes.mock.calls
    expect(callDeletePlanes.length).toBe(1)
    expect(result.current.selectedElements).toBe(null)
    expect(result.current.selectedElement).toBe(null)
    expect(result.current.cutPlaneDirection).toBe(null)
    await actAsyncFlush()
  })

  it('prevent reloading without user approval when loading a model from local', async () => {
    window.addEventListener = jest.fn()
    jest.spyOn(AllCadView, 'getNewModelRealPath').mockReturnValue('haus.ifc')
    const mockCurrentLocationValue = {pathname: '/haus.ifc', search: '', hash: '', state: null, key: 'default'}
    reactRouting.useLocation.mockReturnValue(mockCurrentLocationValue)

    const modelPath = {
      filepath: `haus.ifc`,
    }
    const viewer = __getIfcViewerAPIMockSingleton()

    viewer._loadedModel.ifcManager.getSpatialStructure.mockReturnValueOnce(makeTestTree())
    render(
        <ShareMock>
          <CadView
            installPrefix=''
            appPrefix=''
            pathPrefix='/v/new'
            modelPath={modelPath}
          />
        </ShareMock>,
    )
    await waitFor(() => screen.getByTitle(/Bldrs: 1.0.0/i))
    await actAsyncFlush()

    viewer._loadedModel.ifcManager.getSpatialStructure.mockReturnValueOnce(makeTestTree())
    render(
        <ShareMock>
          <CadView
            installPrefix=''
            appPrefix=''
            pathPrefix=''
            modelPath={modelPath}
          />
        </ShareMock>,
    )
    expect(window.addEventListener).toHaveBeenCalledWith('beforeunload', expect.anything())
    await actAsyncFlush()
  })
})
