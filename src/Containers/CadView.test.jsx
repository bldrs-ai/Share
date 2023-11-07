import React, {useState} from 'react'
import * as reactRouting from 'react-router-dom'
import {render, renderHook, act, fireEvent, screen, waitFor} from '@testing-library/react'
import {IfcViewerAPIExtended} from '../Infrastructure/IfcViewerAPIExtended'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import * as AllLoader from '../utils/loader'
import {actAsyncFlush} from '../utils/tests'
import {makeTestTree} from '../utils/TreeUtils.test'
import CadView, {getFinalURL} from './CadView'
import PkgJson from '../../package.json'


const bldrsVersionString = `Bldrs: ${PkgJson.version}`
const mockedUseNavigate = jest.fn()
const defaultLocationValue = {pathname: '/index.ifc', search: '', hash: '', state: null, key: 'default'}
jest.mock('react-router-dom', () => {
  return {
    ...jest.requireActual('react-router-dom'),
    useNavigate: () => mockedUseNavigate,
    useLocation: jest.fn(() => defaultLocationValue),
  }
})
jest.mock('postprocessing')


describe('CadView', () => {
  let viewer


  // TODO: `document.createElement` can't be used in testing-library directly, need to move this after fixing that issue
  beforeEach(() => {
    viewer = new IfcViewerAPIExtended()
    viewer._loadedModel.ifcManager.getSpatialStructure.mockReturnValue(makeTestTree())
    viewer.context.getDomElement = jest.fn(() => {
      return document.createElement('div')
    })
  })


  afterEach(() => {
    jest.clearAllMocks()
  })


  it('renders with mock IfcViewerAPIExtended', async () => {
    const modelPath = {
      filepath: `/index.ifc`,
    }
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
    await actAsyncFlush()
    await waitFor(() => screen.getByTitle(bldrsVersionString))
  })


  it('renders and selects the element ID from URL', async () => {
    const testTree = makeTestTree()
    const targetEltId = testTree.children[0].expressID
    const mockCurrLocation = {...defaultLocationValue, pathname: '/index.ifc/1'}
    reactRouting.useLocation.mockReturnValue(mockCurrLocation)
    const modelPath = {
      filepath: `index.ifc`,
      gitpath: undefined,
    }
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
    await actAsyncFlush()
    await waitFor(() => screen.getByTitle(bldrsVersionString))
    const getPropsCalls = viewer.getProperties.mock.calls
    const numCallsExpected = 2 // First for root, second from URL path
    expect(mockedUseNavigate).not.toHaveBeenCalled() // Make sure no redirection happened
    expect(getPropsCalls.length).toBe(numCallsExpected)
    expect(getPropsCalls[0][0]).toBe(0) // call 1, arg 1
    expect(getPropsCalls[0][1]).toBe(targetEltId) // call 1, arg 2
    expect(getPropsCalls[1][0]).toBe(0) // call 2, arg 1
    expect(getPropsCalls[1][1]).toBe(0) // call 2, arg 2
    await actAsyncFlush()
  })


  it('sets up camera and cutting plan from URL,', async () => {
    const mockCurrLocation = {...defaultLocationValue, hash: '#c:1,2,3,4,5,6::p:x=0'}
    reactRouting.useLocation.mockReturnValue(mockCurrLocation)
    const modelPath = {
      filepath: `index.ifc`,
      gitpath: undefined,
    }
    render(
        <ShareMock>
          <CadView
            installPrefix={'/'}
            appPrefix={'/'}
            pathPrefix={'/'}
            modelPath={modelPath}
          />
        </ShareMock>)
    await actAsyncFlush()
    const setCameraPosMock = viewer.IFC.context.ifcCamera.cameraControls.setPosition
    // eslint-disable-next-line no-magic-numbers
    expect(setCameraPosMock).toHaveBeenLastCalledWith(1, 2, 3, true)
    const setCameraTargetMock = viewer.IFC.context.ifcCamera.cameraControls.setTarget
    // eslint-disable-next-line no-magic-numbers
    expect(setCameraTargetMock).toHaveBeenLastCalledWith(4, 5, 6, true)
    const createPlanMock = viewer.clipper.createFromNormalAndCoplanarPoint
    expect(createPlanMock).toHaveBeenCalled()
    await actAsyncFlush()
  })


  it('clear elements and planes on unselect', async () => {
    const testTree = makeTestTree()
    const targetEltId = testTree.children[0].expressID
    const modelPath = {
      filepath: `index.ifc`,
      gitpath: undefined,
    }
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setSelectedElement(targetEltId)
    })
    await act(() => {
      result.current.setSelectedElements([targetEltId])
    })
    await act(() => {
      result.current.setCutPlaneDirections(['y'])
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
    await act(async () => {
      await fireEvent.click(clearSelection)
    })
    const callDeletePlanes = viewer.clipper.deleteAllPlanes.mock.calls
    expect(callDeletePlanes.length).toBe(1)
    expect(result.current.selectedElements).toHaveLength(0)
    expect(result.current.selectedElement).toBe(null)
    expect(result.current.cutPlanes.length).toBe(0)
    await actAsyncFlush()
  })


  it('prevent reloading without user approval when loading a model from local', async () => {
    window.addEventListener = jest.fn()
    jest.spyOn(AllLoader, 'getUploadedBlobPath').mockReturnValue('/haus.ifc')
    const mockCurrLocation = {...defaultLocationValue, pathname: '/haus.ifc'}
    reactRouting.useLocation.mockReturnValue(mockCurrLocation)
    const modelPath = {
      filepath: `/haus.ifc`,
    }
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
    await actAsyncFlush()
    await waitFor(() => screen.getByTitle(bldrsVersionString))
    await actAsyncFlush()
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
    await actAsyncFlush()
    expect(window.addEventListener).toHaveBeenCalledWith('beforeunload', expect.anything())
  })


  it('select multiple elements and then clears selection, then reselect', async () => {
    const selectedId = '123'
    const selectedIdsAsString = ['0', '1']
    const elementCount = 2
    const modelPath = {
      filepath: `index.ifc`,
      gitpath: undefined,
    }
    const {result} = renderHook(() => useStore((state) => state))
    await act(async () => {
      await result.current.setSelectedElement(selectedId)
      await result.current.setSelectedElements(selectedIdsAsString)
    })
    expect(result.current.selectedElement).toBe(selectedId)
    expect(result.current.selectedElements).toBe(selectedIdsAsString)

    const {getByTitle} = render(
        <ShareMock>
          <CadView
            installPrefix={'/'}
            appPrefix={'/'}
            pathPrefix={'/'}
            modelPath={modelPath}
          />
        </ShareMock>,
    )
    expect(getByTitle('Section')).toBeInTheDocument()
    expect(getByTitle('Clear')).toBeInTheDocument()
    const clearSelection = getByTitle('Clear')
    await act(async () => {
      await fireEvent.click(clearSelection)
    })
    expect(result.current.selectedElement).toBe(null)
    expect(result.current.selectedElements).toHaveLength(0)
    await act(async () => {
      await result.current.setSelectedElements(selectedIdsAsString)
    })
    expect(result.current.selectedElements).toHaveLength(elementCount)
  })


  it('can clear selection using Escape key', async () => {
    const selectedIdsAsString = ['0', '1']
    const elementCount = 2
    const modelPath = {
      filepath: `index.ifc`,
      gitpath: undefined,
    }
    const {result} = renderHook(() => useStore((state) => state))
    const {getByTitle} = render(
        <ShareMock>
          <CadView
            installPrefix={'/'}
            appPrefix={'/'}
            pathPrefix={'/'}
            modelPath={modelPath}
          />
        </ShareMock>)
    await actAsyncFlush()
    expect(getByTitle('Section')).toBeInTheDocument()
    await act(() => {
      result.current.setSelectedElements(selectedIdsAsString)
    })
    expect(result.current.selectedElements).toHaveLength(elementCount)
    fireEvent.keyDown(getByTitle('Section'), {key: 'Escape', code: 'Escape', charCode: 27})
    expect(result.current.selectedElements).toHaveLength(0)
    await actAsyncFlush()
  })


  it('can highlight some elements based on state change', async () => {
    const highlightedIdsAsString = ['0', '1']
    const modelId = 0
    const elementCount = 2
    const modelPath = {
      filepath: `index.ifc`,
      gitpath: undefined,
    }
    const {result} = renderHook(() => useStore((state) => state))
    const {getByTitle} = render(
        <ShareMock>
          <CadView
            installPrefix={'/'}
            appPrefix={'/'}
            pathPrefix={'/'}
            modelPath={modelPath}
          />
        </ShareMock>)
    await actAsyncFlush()
    expect(getByTitle('Section')).toBeInTheDocument()
    await act(() => {
      result.current.setPreselectedElementIds(highlightedIdsAsString)
    })
    expect(result.current.preselectedElementIds).toHaveLength(elementCount)
    expect(viewer.preselectElementsByIds).toHaveBeenLastCalledWith(modelId, highlightedIdsAsString)

    await actAsyncFlush()
  })


  // TODO(https://github.com/bldrs-ai/Share/issues/622): SceneLayer breaks postprocessing
  /*
  import {__getIfcViewerAPIMockSingleton} from '../../__mocks__/web-ifc-viewer'
  it('SceneLayer accesses IFC camera, renderer and scene camera', async () => {
    const modelPath = {
      filepath: `/index.ifc`,
    }
    renderHook(() => useState(modelPath))
    render(
        <ShareMock>
          <CadView installPrefix={'/'} appPrefix={'/'} pathPrefix={'/'} modelPath={modelPath}/>
        </ShareMock>)
    expect(viewer.IFC.context.getCamera).toHaveBeenCalled()
    expect(viewer.IFC.context.getRenderer).toHaveBeenCalled()
    expect(viewer.IFC.context.getScene).toHaveBeenCalled()
    await actAsyncFlush()
  })
  */
})


describe('With environment variables', () => {
  const OLD_ENV = process.env


  beforeEach(() => {
    jest.resetModules()
    process.env = {...OLD_ENV}
  })


  afterAll(() => {
    process.env = OLD_ENV
  })


  it('getFinalURL', async () => {
    expect(await getFinalURL('https://github.com/')).toStrictEqual('https://raw.githubusercontent.com/')

    process.env.RAW_GIT_PROXY_URL = 'https://rawgit.bldrs.dev'
    expect(await getFinalURL('https://github.com/')).toStrictEqual('https://rawgit.bldrs.dev/')
  })
})
