import axios from 'axios'
import React from 'react'
import * as reactRouting from 'react-router-dom'
import * as Ifc from '@bldrs-ai/ifclib'
import {render, renderHook, act, fireEvent, screen, waitFor, within} from '@testing-library/react'
import * as Filetype from '../Filetype'
import ShareMock from '../ShareMock'
import {testId as aboutControlTestId} from '../Components/About/AboutControl'
import {HASH_PREFIX_CUT_PLANE} from '../Components/CutPlane/hashState'
import {HASH_PREFIX_CAMERA} from '../Components/Camera/hashState'
import {ShareViewer} from '../viewer/ShareViewer'
import SearchIndex from '../search/SearchIndex'
import useStore from '../store/useStore'
import * as Loader from '../loader/Loader'
import {makeTestTree} from '../utils/TreeUtils.test'
import {actAsyncFlush} from '../utils/tests'
import CadView from './CadView'


window.HTMLElement.prototype.scrollIntoView = jest.fn()
const mockedUseNavigate = jest.fn()
const defaultLocationValue = {pathname: '/index.ifc', search: '', hash: '', state: null, key: 'default'}
// mock createObjectURL
global.URL.createObjectURL = jest.fn(() => '1111111111111111111111111111111111111111')

jest.mock('axios')
jest.mock('@bldrs-ai/ifclib')
jest.mock('../Filetype')
jest.mock('../search/SearchIndex')
// Slice 5b of design/new/viewer-replacement.md: the IFC parse path
// goes through `parseIfcWithConway` + `buildConwayIfcModel` instead
// of wit-three's `IFCLoader.parse`. The web-ifc-viewer mock
// auto-mocks `three`, which leaves `BufferGeometry` + `Mesh` without
// their real methods — production `buildConwayIfcModel` produces a
// broken Mesh under that mock. We short-circuit the Conway-direct
// module pair to feed the load pipeline `viewer._loadedModel` (the
// wit-three-shape fake the rest of the CadView assertions expect).
// Scoped to this test file because production unit tests for
// `buildConwayIfcModel` need the real implementation.
jest.mock('../viewer/ifc/conwayDirectIfcLoader', () => ({
  parseIfcWithConway: () => ({modelID: 0, captured: []}),
  decorateConwayDirectIfcModel: () => {},
}))
jest.mock('../viewer/ifc/buildConwayIfcModel', () => ({
  buildConwayIfcModel: () => {
    const {__getShareViewerMockSingleton} = require('web-ifc-viewer')
    return {
      mesh: __getShareViewerMockSingleton()._loadedModel,
      materials: [],
      stats: {
        vertexCount: 0,
        triangleCount: 0,
        instanceCount: 0,
        parentCount: 0,
        materialCount: 0,
        skippedFlatMeshes: 0,
        skippedPlacedGeometries: 0,
      },
    }
  },
}))
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
      // Read the file content from disk
      const fileContent = fs.readFileSync(path.join(__dirname, './index.ifc'), 'utf8')

      const uint8Array = new Uint8Array(fileContent)
      const blob = new Blob([uint8Array])

      // The lastModified property is optional, and can be omitted or set to Date.now() if needed
      const file = new FileMock([blob], 'index.ifc', {type: 'text/plain', lastModified: Date.now()})
      // Return the mocked File in a promise if it's an async function
      return Promise.resolve(file)
    }),
    downloadModel: jest.fn().mockImplementation(() => {
      // Read the file content from disk
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
    axios.get.mockResolvedValue({
      data: null,
    })
    Filetype.getValidExtension.mockReturnValue('ifc')
    Filetype.guessType.mockResolvedValue('ifc')
    Filetype.guessTypeFromFile.mockResolvedValue('ifc')
    Ifc.getType.mockResolvedValue(null)
    SearchIndex.mockImplementation(() => {
      return {
        indexElementsByString: jest.fn(),
      }
    })
    // jest.spyOn(Loader, 'readModel').mockReturnValue({})
  })


  // TODO: `document.createElement` can't be used in testing-library directly, need to move this after fixing that issue
  beforeEach(() => {
    viewer = new ShareViewer()
    // Slice 5d.3: `_loadedModel` lives on the singleton fork mock that
    // `__mocks__/web-ifc-viewer.js` exposes via `__getShareViewerMockSingleton`.
    // Pre-5d.3 this was reached via `viewer._fork`, but the `_fork`
    // composition pointer is gone now that ShareViewer instantiates
    // IfcContext + IfcManager + IfcClipper directly.
    const {__getShareViewerMockSingleton: getSingleton} = require('web-ifc-viewer')
    getSingleton()._loadedModel.ifcManager.getSpatialStructure.mockReturnValue(makeTestTree())
    viewer.context.getDomElement = jest.fn(() => {
      return document.createElement('div')
    })
  })


  afterEach(() => {
    jest.clearAllMocks()
    global.Worker = originalWorker
  })


  it('renders with mock ShareViewer', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
    render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
    // Necessary to wait for some of the component to render to avoid
    // act() warnings from testing-library.
    await actAsyncFlush()
    await waitFor(() => screen.getByTestId(aboutControlTestId))
  })


  // Regression: two useEffects in CadView can each kick off `onViewer()` —
  // the [viewer]-dep effect (after `onModelPath` calls `setViewer`) and the
  // [isAuthLoading, …]-dep effect (retries when auth resolves after an
  // earlier early-return). Pre-fix, `isViewerLoaded` was only set at the
  // END of `onViewer`, so an auth-resolve mid-`loadModel` left
  // `isViewerLoaded` false and both effects ran end-to-end — the Safari
  // double-load (1.5–2s apart). The in-flight ref dedupes overlapping
  // calls; this test exercises the case where auth resolves WHILE the
  // first load is mid-flight and asserts `downloadToOPFS` only fires once.
  it('does not double-load when auth resolves mid-load (Safari race)', async () => {
    // The bug pre-fix: two useEffects in CadView could each kick off
    // `onViewer()` — the [viewer]-dep one after `setViewer`, and the
    // [isAuthLoading, …]-dep one when auth settled. The second's
    // `!isViewerLoaded` guard was insufficient because `isViewerLoaded`
    // is only flipped AT THE END of `onViewer`; if auth resolved while
    // the first load was still inside `loadModel`, both ran end-to-end.
    //
    // To exercise the race in jsdom (where everything finishes too fast
    // for the natural flow to trip it), we hold the OPFS download mid-
    // flight with a manual deferred Promise, flip the auth flag during
    // that pause, then release the load and count the `downloadToOPFS`
    // calls. Pre-fix this counts 2; with the in-flight ref it counts 1.
    const OPFSUtils = jest.requireMock('../OPFS/utils')
    OPFSUtils.downloadToOPFS.mockClear()
    const originalImpl = OPFSUtils.downloadToOPFS.getMockImplementation()
    let releaseLoad
    const loadInFlight = new Promise((resolve) => {
      releaseLoad = resolve
    })
    OPFSUtils.downloadToOPFS.mockImplementation(async (...args) => {
      await loadInFlight
      return originalImpl(...args)
    })

    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setIsOpfsAvailable(true))
    await act(() => result.current.setModelPath({filepath: `/index.ifc`}))

    render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
    await actAsyncFlush()

    // First onViewer is now suspended inside downloadToOPFS, waiting on
    // `loadInFlight`. Flip auth — pre-fix this fires the auth-effect's
    // onViewer, which races the suspended one.
    await act(() => {
      result.current.setIsAuthResolved(true)
    })
    await actAsyncFlush()

    // Release the suspended load. Now both pre-fix flows would proceed.
    releaseLoad()
    await waitFor(() => screen.getByTestId(aboutControlTestId))
    await actAsyncFlush()

    // Restore the mock for any subsequent tests.
    OPFSUtils.downloadToOPFS.mockImplementation(originalImpl)

    expect(OPFSUtils.downloadToOPFS).toHaveBeenCalledTimes(1)
  })


  // Regression: the React effect `[selectedElements, selectedInstanceIds]`
  // dispatches `viewer.setInstanceSelection` whenever `selectedInstanceIds`
  // is non-empty. Pre-`ids.length > 0` guard, a stale `selectedInstanceIds`
  // left over after a parent-selection clear (or after a hide that
  // preserves store state) would re-create the Conway selection subset
  // against an orphan parent — the cyan-rebirth-after-hide regression.
  // The guard makes the effect skip `setInstanceSelection` when the
  // parent-level ids are empty. This test exercises that path.
  it('useEffect skips setInstanceSelection when selectedElements is empty', async () => {
    // Post-slice-5c: ShareViewer composes the fork rather than extending
    // it, so each `new ShareViewer()` is a fresh instance. Spy on the
    // prototype so both the test's local `viewer` and CadView's own
    // `initViewer()` instance route through the same Jest mock.
    const setInstanceSelectionSpy = jest.spyOn(ShareViewer.prototype, 'setInstanceSelection')
      .mockImplementation(() => {})
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
    render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
    await actAsyncFlush()
    await waitFor(() => screen.getByTestId(aboutControlTestId))
    // Set ONLY selectedInstanceIds — leave selectedElements at its
    // empty-array default. The effect runs on the dep change; the
    // guard should swallow it.
    setInstanceSelectionSpy.mockClear()
    const STALE_INSTANCE_ID = 42
    await act(() => result.current.setSelectedInstanceIds([STALE_INSTANCE_ID]))
    await actAsyncFlush()
    expect(setInstanceSelectionSpy).not.toHaveBeenCalled()
  })


  // Regression (nav→scene sync): `selectItemsInScene` is the single
  // selection funnel and must own BOTH `selectedElements` and the
  // Conway-direct per-instance `selectedInstanceIds`. Pre-fix only the
  // scene-pick handler ever set/cleared `selectedInstanceIds`, so a
  // selection arriving from any other source (NavTree click, search,
  // keyboard deselect) left a STALE per-instance highlight behind that
  // the `[selectedElements, selectedInstanceIds]` effect re-applied over
  // the new/empty selection — the scene stopped following the tree.
  // Deselecting via the funnel (Clear) must now also clear the instance
  // highlight. Reuses the render + Clear mechanics of the unselect test.
  it('deselect clears a stale per-instance highlight (funnel owns selectedInstanceIds)', async () => {
    const testTree = makeTestTree()
    const targetEltId = testTree.children[0].expressID
    const STALE_INSTANCE_ID = 42
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setModelPath({filepath: `/index.ifc`})
      result.current.setSelectedElement(targetEltId)
      result.current.setSelectedElements([`${targetEltId}`])
      // Simulate the residue of a prior Conway-direct scene pick.
      result.current.setSelectedInstanceIds([STALE_INSTANCE_ID])
    })

    const {getByTestId} =
      render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)

    const eltGrp = getByTestId('element-group')
    const clearSelection = within(eltGrp).getByTitle('Clear')
    await act(async () => {
      await fireEvent.click(clearSelection)
    })
    expect(result.current.selectedElements).toHaveLength(0)
    expect(result.current.selectedInstanceIds).toHaveLength(0)
    await actAsyncFlush()
  })


  // TODO(nickcastel50): See Issue #956
  it.skip('renders and selects the element ID from URL', async () => {
    const mockCurrLocation = {...defaultLocationValue, pathname: '/index.ifc/89'}
    reactRouting.useLocation.mockReturnValue(mockCurrLocation)
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
    render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
    await actAsyncFlush()
    await waitFor(() => screen.getByTestId(aboutControlTestId))
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


  it('renders with mock ShareViewer and simulates drag and drop', async () => {
    // mock webworker
    const mockWorker = {
      addEventListener: jest.fn(),
      postMessage: jest.fn(),
    }
    global.Worker = jest.fn(() => mockWorker)
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
    render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)

    // Wait for component to be fully loaded
    // Necessary to wait for some of the component to render to avoid
    // act() warnings from testing-library.
    await actAsyncFlush()
    await waitFor(() => screen.getByTestId(aboutControlTestId))

    // Identify the drop zone element using the cadview-dropzone attribute
    const dropZone = screen.getByTestId('cadview-dropzone')
    // console.error('dropzone', dropZone)

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

    await actAsyncFlush()

    // Verify that URL.createObjectURL was called
    expect(global.URL.createObjectURL).toHaveBeenCalled()
  })


  it('sets up camera and cutting plane from URL,', async () => {
    const mockCurrLocation = {
      ...defaultLocationValue,
      hash: `#${HASH_PREFIX_CAMERA}:1,2,3,4,5,6;${HASH_PREFIX_CUT_PLANE}:x=0`,
    }
    reactRouting.useLocation.mockReturnValue(mockCurrLocation)
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setIsOpfsAvailable(false))
    await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
    render(
      <ShareMock>
        <CadView installPrefix='/' appPrefix='' pathPrefix='' modelPath={{filepath: '/index.ifc'}}/>
      </ShareMock>,
    )
    await actAsyncFlush()
    const setCameraPosMock = viewer.IFC.context.ifcCamera.cameraControls.setPosition
    expect(setCameraPosMock).toHaveBeenLastCalledWith(1, 2, 3, true)
    const setCameraTargetMock = viewer.IFC.context.ifcCamera.cameraControls.setTarget
    expect(setCameraTargetMock).toHaveBeenLastCalledWith(4, 5, 6, true)
    // ShareViewer wraps the fork's `IFC.clipper` in a Clipper plugin;
    // the IFC-mode `createFromNormalAndCoplanarPoint` delegates to the
    // fork clipper, captured at construction time as `_forkClipper`.
    const createPlanMock = viewer._forkClipper.createFromNormalAndCoplanarPoint
    expect(createPlanMock).toHaveBeenCalled()
    await actAsyncFlush()
  })


  it('clear elements and planes on unselect', async () => {
    const testTree = makeTestTree()
    const targetEltId = testTree.children[0].expressID
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setModelPath({filepath: `/index.ifc`})
      result.current.setSelectedElement(targetEltId)
      result.current.setSelectedElements([targetEltId])
      result.current.setCutPlaneDirections(['y'])
    })

    const {getByTestId} =
          render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)

    const eltGrp = getByTestId('element-group')
    expect(within(eltGrp).getByTitle('Section')).toBeInTheDocument()
    const clearSelection = within(eltGrp).getByTitle('Clear')
    await act(async () => {
      await fireEvent.click(clearSelection)
    })
    // Clipper plugin delegates IFC-mode deleteAllPlanes to _forkClipper.
    const callDeletePlanes = viewer._forkClipper.deleteAllPlanes.mock.calls
    expect(callDeletePlanes.length).toBe(1)
    expect(result.current.selectedElements).toHaveLength(0)
    expect(result.current.selectedElement).toBe(null)
    // TODO(pablo): hack after refactor, was 0, but UI looks right
    expect(result.current.cutPlanes.length).toBe(2)
    await actAsyncFlush()
  })


  it('prevent reloading without user approval when loading a model from local', async () => {
    window.addEventListener = jest.fn()
    const testPath = '/4be9c3dc-e138-47e9-962b-d0cf55cbbc26.ifc'
    jest.spyOn(Loader, 'constructUploadedBlobPath').mockReturnValue(testPath)
    const mockCurrLocation = {...defaultLocationValue, pathname: testPath}
    reactRouting.useLocation.mockReturnValue(mockCurrLocation)
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setModelPath({filepath: testPath}))
    render(
      <ShareMock><CadView installPrefix='' appPrefix='' pathPrefix='/v/new'/></ShareMock>,
    )
    await actAsyncFlush()
    await waitFor(() => screen.getByTestId(aboutControlTestId))
    await actAsyncFlush()

    render(<ShareMock><CadView installPrefix={''} appPrefix={''} pathPrefix={''}/></ShareMock>)
    await actAsyncFlush()
    expect(window.addEventListener).toHaveBeenCalledWith('beforeunload', expect.anything())
  })


  it('select multiple elements and then clears selection, then reselect', async () => {
    const selectedId = '123'
    const selectedIdsAsString = ['0', '1']
    const elementCount = 2
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
    await act(async () => {
      await result.current.setSelectedElement(selectedId)
      await result.current.setSelectedElements(selectedIdsAsString)
    })
    expect(result.current.selectedElement).toBe(selectedId)
    expect(result.current.selectedElements).toBe(selectedIdsAsString)

    const {getByTestId} =
      render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)

    const eltGrp = getByTestId('element-group')
    expect(within(eltGrp).getByTitle('Section')).toBeInTheDocument()
    const clearSelection = within(eltGrp).getByTitle('Clear')
    expect(clearSelection).toBeInTheDocument()
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
    // Post-slice-5c: ShareViewer composes the fork rather than extending
    // it, so each `new ShareViewer()` is a fresh instance. Spy on the
    // prototype so both the test's local `viewer` and CadView's own
    // `initViewer()` instance route through the same Jest mock.
    const preselectSpy = jest.spyOn(ShareViewer.prototype, 'preselectElementsByIds')
      .mockImplementation(() => {})
    const highlightedIdsAsString = ['0', '1']
    const modelId = 0
    const elementCount = 2
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
    const {getByTitle} =
      render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
    await actAsyncFlush()
    expect(getByTitle('Section')).toBeInTheDocument()
    await act(() => {
      result.current.setPreselectedElementIds(highlightedIdsAsString)
    })
    expect(result.current.preselectedElementIds).toHaveLength(elementCount)
    expect(preselectSpy).toHaveBeenLastCalledWith(modelId, highlightedIdsAsString)
    await actAsyncFlush()
  })

  it('sets OOM alert object when loader throws out-of-memory error', async () => {
    // Spy on load (indirectly invoked through loadModel -> load) to throw OOM
    const oomErr = new Error('Out of memory: wasm memory allocate failed')
    oomErr.isOutOfMemory = true
    jest.spyOn(Loader, 'load').mockImplementation(() => {
      throw oomErr
    })
    // mock console.error and check that it was called
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    // mock captureException and check that it was called
    const Sentry = require('@sentry/react')
    const captureExceptionSpy = jest.spyOn(Sentry, 'captureException').mockImplementation(() => {})
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
    render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
    await actAsyncFlush()
    await waitFor(() => {
      const alert = result.current.alert
      expect(alert).toBeTruthy()
      expect(alert.type).toBe('oom')
      expect(alert.message.toLowerCase()).toContain('out of memory')
    })
    expect(consoleErrorSpy).toHaveBeenCalledWith(oomErr)
    expect(captureExceptionSpy).toHaveBeenCalledWith(oomErr)
  })

  // TODO(https://github.com/bldrs-ai/Share/issues/622): SceneLayer breaks postprocessing
  /*
  import {__getIfcViewerAPIMockSingleton} from '../../__mocks__/web-ifc-viewer'
  it('SceneLayer accesses IFC camera, renderer and scene camera', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setModelPath({
        filepath: `/index.ifc`,
      })
    })
    render(
        <ShareMock>
          <CadView installPrefix={'/'} appPrefix={'/'} pathPrefix={'/'}/>
        </ShareMock>)
    expect(viewer.IFC.context.getCamera).toHaveBeenCalled()
    expect(viewer.IFC.context.getRenderer).toHaveBeenCalled()
    expect(viewer.IFC.context.getScene).toHaveBeenCalled()
    await actAsyncFlush()
  })
  */
})
