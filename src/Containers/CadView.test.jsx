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
// mock createObjectURL
global.URL.createObjectURL = jest.fn(() => '1111111111111111111111111111111111111111')

jest.mock('../OPFS/utils', () => {
  const actualUtils = jest.requireActual('../OPFS/utils')
  const fs = jest.requireActual('fs')
  const path = jest.requireActual('path')
  const Blob = jest.requireActual('node:buffer').Blob

  /**
   * FileMock - Mocks File Web Interface
   */
  class FileMock {
    /**
     *
     * @param {Blob} blobParts
     * @param {string} fileName
     * @param {any} options
     */
    constructor(blobParts, fileName, options) {
      this.blobParts = blobParts
      this.name = fileName
      this.lastModified = options.lastModified || Date.now()
      this.type = options.type
      // Implement other properties and methods as needed for your tests
    }

    // Implement any required methods (e.g., slice, arrayBuffer, text) if your code uses them
  }

  return {
    ...actualUtils, // Preserve other exports from the module
    downloadToOPFS: jest.fn().mockImplementation(() => {
      // Read the file content from disk (consider using async read in real use-cases)
      const fileContent = fs.readFileSync(path.join(__dirname, './index.ifc'), 'utf8')

      const uint8Array = new Uint8Array(fileContent)
      const blob = new Blob([uint8Array])

      // The lastModified property is optional, and can be omitted or set to Date.now() if needed
      const file = new FileMock([blob], 'index.ifc', {type: 'text/plain', lastModified: Date.now()})
      // Return the mocked File in a promise if it's an async function
      return Promise.resolve(file)
    }),
  }
})


jest.mock('react-router-dom', () => {
  return {
    ...jest.requireActual('react-router-dom'),
    useNavigate: () => mockedUseNavigate,
    useLocation: jest.fn(() => defaultLocationValue),
  }
})
jest.mock('postprocessing')
jest.mock('@auth0/auth0-react', () => {
  return {
    ...jest.requireActual('@auth0/auth0-react'),
    useAuth0: () => jest.fn(() => {
      return {
        isLoading: () => false,
        isAuthenticated: () => false,
      }
    }),
  }
})


describe('CadView', () => {
  let viewer

  let originalWorker

  beforeAll(() => {
    // Store the original Worker in case other tests need it
    originalWorker = global.Worker
  })


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
    global.Worker = originalWorker
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

  // TODO(nickcastel50): See Issue #956
  it.skip('renders and selects the element ID from URL', async () => {
    const mockCurrLocation = {...defaultLocationValue, pathname: '/index.ifc/89'}
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
    const numCallsExpected = 3 // First for root, second from URL path

    const testEltId = 89

    expect(mockedUseNavigate).not.toHaveBeenCalled() // Make sure no redirection happened
    expect(getPropsCalls.length).toBe(numCallsExpected)
    expect(getPropsCalls[0][0]).toBe(0) // call 1, arg 1
    expect(getPropsCalls[0][1]).toBe(0) // call 1, arg 2
    expect(getPropsCalls[1][0]).toBe(0) // call 2, arg 1
    expect(getPropsCalls[1][1]).toBe(testEltId) // call 2, arg 2
    await actAsyncFlush()
  })

  it('renders with mock IfcViewerAPIExtended and simulates drag and drop', async () => {
    // mock webworker
    const mockWorker = {
      addEventListener: jest.fn(),
      postMessage: jest.fn(),
    }
    global.Worker = jest.fn(() => mockWorker)
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

    // Wait for component to be fully loaded
    // Necessary to wait for some of the component to render to avoid
    // act() warnings from testing-library.
    await actAsyncFlush()
    await waitFor(() => screen.getByTitle(bldrsVersionString))

    // Identify the drop zone element using the cadview-dropzone attribute
    const dropZone = screen.getByTestId('cadview-dropzone')

    // Create a mock file
    const file = new File(['content'], 'index.ifc', {type: 'application/ifc'})

    // Create a mock DataTransfer object
    const dataTransfer = {
      files: [file],
      items: [{
        kind: 'file',
        type: file.type,
        getAsFile: () => file,
      }],
      types: ['Files'],
    }

    // Simulate the drag over and drop events
    fireEvent.dragOver(dropZone, {dataTransfer})
    fireEvent.drop(dropZone, {dataTransfer})

    // Verify that URL.createObjectURL was called
    expect(global.URL.createObjectURL).toHaveBeenCalled()

    // this is about as far as we can go since OPFS doesn't work in this context
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
