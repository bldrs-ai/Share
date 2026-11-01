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
// Slice 5d.4: ShareViewer no longer self-imports the fork to trigger the
// Jest harness, so load it explicitly here — before the first import
// that pulls in ShareViewer (→ IfcContext / ShareIfc) — so the harness's
// jest.mock() registrations land first. The lazy
// `require('../../__mocks__/shareViewerTestHarness')` calls in the test
// bodies below read its singleton.
import '../../__mocks__/shareViewerTestHarness'
import {ShareViewer} from '../viewer/ShareViewer'
import {getSelectionFunnel} from '../viewer/tools/selectionFunnel'
import Clipper from '../viewer/three/Clipper'
import ThreeContext from '../viewer/three/ThreeContext'
import SearchIndex from '../search/SearchIndex'
import useStore from '../store/useStore'
import * as Loader from '../loader/Loader'
import {EngineOpenFailureError} from '../loader/engineOpenFailure'
import {UnsupportedSchemaError} from '../loader/unsupportedSchema'
import {ZipArchiveError} from '../loader/zipArchive'
import {registerInMemoryUpload, resetInMemoryUploadsForTest} from '../loader/inMemoryUploads'
import {
  InMemoryUploadGoneError,
  UploadNotInBrowserError,
  inMemoryUploadGoneAlert,
} from '../OPFS/messages'
import {makeTestTree} from '../utils/TreeUtils.test'
import {actAsyncFlush, suppressActWarnings} from '../utils/tests'
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
// of wit-three's `IFCLoader.parse`. The ShareViewer test harness
// auto-mocks `three`, which leaves `BufferGeometry` + `Mesh` without
// their real methods — production `buildConwayIfcModel` produces a
// broken Mesh under that mock. We short-circuit the Conway-direct
// module pair to feed the load pipeline `viewer._loadedModel` (the
// wit-three-shape fake the rest of the CadView assertions expect).
// Scoped to this test file because production unit tests for
// `buildConwayIfcModel` need the real implementation.
// `recapture` is part of the parse's return contract, not an optional
// extra: since conway#638 the streaming path keeps no copy of the mesh
// stream, so it — not `captured` — is what the degraded end-of-load builds
// read. A double that omits it makes `ShareIfcLoader#parse` throw
// "recapture is not a function" on the fallback path.
//
// ASYNC, matching the real seam (conway#660): `recapture()` returns a
// Promise on every path, because a windowed re-extraction pages bytes off
// the byte store and cannot be synchronous. The sync form passed only
// because `await` normalises a plain array.
//
// Stated precisely, because the obvious stronger claim is false: making
// this double async does NOT give this file a dropped-`await` detector.
// Measured — with the `await` removed from the merged degraded build, this
// whole file stays green either way, because the `buildConwayIfcModel`
// double below ignores its argument entirely and hands back the harness
// singleton. What guards that call site is
// `ShareIfcLoader.degraded.test.js`, whose builder doubles assert on the
// meshes they receive. This double is here to stop a fixture from
// contradicting the contract it stands in for, not to catch a regression.
jest.mock('../viewer/ifc/conwayDirectIfcLoader', () => ({
  // eslint-disable-next-line require-await
  parseIfcWithConway: () => ({modelID: 0, captured: [], recapture: async () => []}),
  decorateConwayDirectIfcModel: () => {},
}))
jest.mock('../viewer/ifc/buildConwayIfcModel', () => ({
  buildConwayIfcModel: () => {
    const {__getShareViewerMockSingleton} = require('../../__mocks__/shareViewerTestHarness')
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
// Signed out unless a test says otherwise (the Drive sign-in guard below).
// The `mock` prefix lets the hoisted factory read it.
const mockAuthState = {isLoading: false, isAuthenticated: false}
jest.mock('@auth0/auth0-react', () => {
  return {
    ...jest.requireActual('@auth0/auth0-react'),
    useAuth0: () => mockAuthState,
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

    // Slice 5d.2: `viewer.clipper.setModel(model)` (called by
    // CutPlaneMenu on model load) now builds a real per-model
    // `MeshClipper`, which reads model bounds via three's
    // `Box3.setFromObject` — a path the auto-mocked three here doesn't
    // support (its mocks don't chain / lack instance fields). CadView's
    // clipping tests verify orchestration (that the cut-plane menu calls
    // `createFromNormalAndCoplanarPoint` / `deleteAllPlanes`), not the
    // MeshClipper internals (covered by MeshClipper.test.js with real
    // three). Stub setModel to a no-op so `_meshClipper` is never built;
    // every other Clipper method then short-circuits via `_meshClipper?.`
    // and stays a safe no-op the prototype spies below can observe.
    jest.spyOn(Clipper.prototype, 'setModel').mockImplementation(() => {})
  })


  // TODO: `document.createElement` can't be used in testing-library directly, need to move this after fixing that issue
  beforeEach(() => {
    viewer = new ShareViewer()
    // Slice 5d.3: `_loadedModel` lives on the singleton fork mock that
    // `__mocks__/shareViewerTestHarness.js` exposes via `__getShareViewerMockSingleton`.
    // Pre-5d.3 this was reached via `viewer._fork`, but the `_fork`
    // composition pointer is gone now that ShareViewer instantiates
    // IfcContext + IfcManager + IfcClipper directly.
    const {__getShareViewerMockSingleton: getSingleton} = require('../../__mocks__/shareViewerTestHarness')
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
    // The mocked model load resolves on its own timers and drives CadView's
    // mount setStates (setSelectedElement, ViewerContainer) *during* the
    // waitFor below — outside any act scope RTL can enclose, so no amount of
    // flushing catches them. This is the one test that trips it; swallow just
    // that act warning. The behavior under test (setInstanceSelection is not
    // called) is asserted directly and unaffected.
    const restoreActWarnings = suppressActWarnings()
    // try/finally so a failed assertion can't leave console.error mocked for
    // the rest of the file — that would swallow every later test's errors.
    try {
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
    } finally {
      restoreActWarnings()
    }
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


  // The funnel is reachable outside React for the Assist view tools
  // (viewer/tools/selectionFunnel.js, #1674). What's registered must BE the
  // funnel — the same store contract a NavTree click gets, including the
  // per-instance reset above — and must go away with the CadView that
  // registered it, or a tool would select into an unmounted viewer.
  it('registers its selection funnel for non-React callers, and clears it on unmount', async () => {
    const testTree = makeTestTree()
    const targetEltId = testTree.children[0].expressID
    const STALE_INSTANCE_ID = 42
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setModelPath({filepath: `/index.ifc`})
      result.current.setSelectedInstanceIds([STALE_INSTANCE_ID])
    })
    const {unmount} = render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
    await actAsyncFlush()
    await waitFor(() => screen.getByTestId(aboutControlTestId))

    const funnel = getSelectionFunnel()
    expect(typeof funnel).toBe('function')
    await act(() => funnel([targetEltId], false))
    expect(result.current.selectedElements).toEqual([`${targetEltId}`])
    expect(result.current.selectedAnchorIds).toEqual([`${targetEltId}`])
    expect(result.current.selectedInstanceIds).toEqual([])

    unmount()
    expect(getSelectionFunnel()).toBeNull()
  })


  // Codex review on #1946: the gate was read once at mount, but CadView stays
  // mounted across navigation. The hook must follow the URL both ways.
  it('installs the Assist dev hook while ?feature=assist is in the URL, without a remount', async () => {
    // This file mocks the exported useNavigate; drive the router for real.
    let navigateTo = null
    const RouterDriver = () => {
      navigateTo = jest.requireActual('react-router-dom').useNavigate()
      return null
    }
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
    const {unmount} = render(
      <ShareMock initialEntries={['/index.ifc']}>
        <RouterDriver/>
        <CadView installPrefix='' appPrefix='' pathPrefix=''/>
      </ShareMock>)
    await actAsyncFlush()
    expect(window.__bldrsAssistTools).toBeUndefined()

    await act(() => navigateTo('/index.ifc?feature=assist'))
    await waitFor(() => expect(window.__bldrsAssistTools).toBeDefined())
    expect(window.__bldrsAssistTools.list().map(({name}) => name)).toContain('view.select')

    await act(() => navigateTo('/index.ifc'))
    await waitFor(() => expect(window.__bldrsAssistTools).toBeUndefined())

    await act(() => navigateTo('/index.ifc?feature=assist'))
    await waitFor(() => expect(window.__bldrsAssistTools).toBeDefined())
    unmount()
    expect(window.__bldrsAssistTools).toBeUndefined()
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
    // The cut-plane menu drives clipping through `viewer.clipper` (a
    // `Clipper` instance). Spy at the prototype so the assertion catches
    // the call regardless of which ShareViewer/Clipper instance CadView's
    // `initViewer` builds. `setModel` is stubbed (beforeAll), so this
    // just records the orchestration call.
    const createPlaneSpy = jest.spyOn(Clipper.prototype, 'createFromNormalAndCoplanarPoint')
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
    expect(createPlaneSpy).toHaveBeenCalled()
    await actAsyncFlush()
  })


  it('clear elements and planes on unselect', async () => {
    const testTree = makeTestTree()
    const targetEltId = testTree.children[0].expressID
    // Clearing the selection routes through `removePlanes(viewer)` →
    // `viewer.clipper.deleteAllPlanes()`. Spy at the prototype so the
    // assertion catches the call on whichever Clipper instance CadView's
    // `initViewer` built.
    const deleteAllSpy = jest.spyOn(Clipper.prototype, 'deleteAllPlanes')
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
    // Scope the assertion to the clear action, not any setup-time calls.
    deleteAllSpy.mockClear()
    await act(async () => {
      await fireEvent.click(clearSelection)
    })
    expect(deleteAllSpy).toHaveBeenCalled()
    expect(result.current.selectedElements).toHaveLength(0)
    expect(result.current.selectedElement).toBe(null)
    // The store follows the scene: no planes, and the menu not active. This
    // was pinned at 2 while CadView passed resetCutPlaneState its arguments
    // one slot off, which made the reset a no-op (open-205, #2014).
    expect(result.current.cutPlanes).toHaveLength(0)
    expect(result.current.isCutPlaneActive).toBe(false)
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
    // OOM is an expected, handled device-limit outcome (already surfaced to
    // the user via the 'oom' alert), so it is intentionally NOT sent to
    // Sentry's error stream — capturing it is what produced the SHARE-RS
    // noise. Real (non-OOM) loader failures are still captured.
    expect(captureExceptionSpy).not.toHaveBeenCalledWith(oomErr)
  })

  it('alerts on a refused IFC4X3 model, and counts it in Sentry as info rather than an error', async () => {
    const schemaErr = new UnsupportedSchemaError('IFC4X3_RC2')
    jest.spyOn(Loader, 'load').mockImplementation(() => {
      throw schemaErr
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const Sentry = require('@sentry/react')
    const captureExceptionSpy = jest.spyOn(Sentry, 'captureException').mockImplementation(() => {})
    const captureMessageSpy = jest.spyOn(Sentry, 'captureMessage').mockImplementation(() => {})
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
    render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
    await actAsyncFlush()
    await waitFor(() => {
      const alert = result.current.alert
      expect(alert).toBeTruthy()
      expect(alert.type).toBe('unsupportedSchema')
      expect(alert.message).toMatch(/IFC4X3_RC2 \(IFC 4\.3\)/)
    })
    // A deliberate schema refusal (bldrs-ai/conway#713) is a documented limit
    // already explained to the user, not a defect — same reasoning as OOM.
    expect(captureExceptionSpy).not.toHaveBeenCalledWith(schemaErr)
    // …but it is counted, to rank the IFC 4.3 work (Share#1879).
    expect(captureMessageSpy).toHaveBeenCalledWith(
      'Unsupported IFC schema: IFC4X3_RC2',
      expect.objectContaining({level: 'info', fingerprint: ['unsupported-schema', 'IFC4X3_RC2']}))
  })

  // conway#742: an open failure that carries a reason. The alert says it in
  // short form and Sentry gets it as tags/context — it is still an error,
  // unlike the schema refusal above.
  it('alerts with conway\'s failure reason and captures it in Sentry with status and reason', async () => {
    const engineErr = new EngineOpenFailureError(-1, 'UNRECOGNIZED_FORMAT',
      'zip archive (such as .ifczip), not STEP text')
    jest.spyOn(Loader, 'load').mockImplementation(() => {
      throw engineErr
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const Sentry = require('@sentry/react')
    const captureExceptionSpy = jest.spyOn(Sentry, 'captureException').mockImplementation(() => {})
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
    render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
    await actAsyncFlush()
    await waitFor(() => {
      expect(result.current.alert).toEqual({
        type: 'engineFailure',
        message: 'Share couldn\'t read this file: zip archive (such as .ifczip), not STEP text.',
      })
    })
    expect(captureExceptionSpy).toHaveBeenCalledWith(engineErr, expect.objectContaining({
      tags: expect.objectContaining({
        'engine.load_status': 'UNRECOGNIZED_FORMAT',
        'engine.failure_reason': 'zip archive (such as .ifczip), not STEP text',
      }),
      contexts: {engine_failure: {
        status: 'UNRECOGNIZED_FORMAT',
        reason: 'zip archive (such as .ifczip), not STEP text',
      }},
    }))
  })

  // Share#2006: a hosted `.ifczip` that isn't one readable IFC is the user's
  // file, not a defect — its own alert, and no Sentry exception.
  it('alerts on an unopenable hosted .ifczip without capturing it as a defect', async () => {
    const zipErr = new ZipArchiveError('This .ifczip holds no IFC model.')
    jest.spyOn(Loader, 'load').mockImplementation(() => {
      throw zipErr
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const Sentry = require('@sentry/react')
    const captureExceptionSpy = jest.spyOn(Sentry, 'captureException').mockImplementation(() => {})
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
    render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
    await actAsyncFlush()
    await waitFor(() => {
      expect(result.current.alert).toEqual({type: 'archiveUnreadable', message: 'This .ifczip holds no IFC model.'})
    })
    expect(captureExceptionSpy).not.toHaveBeenCalled()
  })

  it('keeps the generic alert and capture when the engine gave no reason', async () => {
    const genericErr = new Error('parseIfcWithConway: OpenModel returned -1')
    jest.spyOn(Loader, 'load').mockImplementation(() => {
      throw genericErr
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const Sentry = require('@sentry/react')
    const captureExceptionSpy = jest.spyOn(Sentry, 'captureException').mockImplementation(() => {})
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
    render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
    await actAsyncFlush()
    await waitFor(() => expect(result.current.alert).toBe(genericErr))
    expect(captureExceptionSpy).toHaveBeenCalledWith(genericErr)
  })

  // #1955: SHARE-1NR, the top hard-failure group, was this case reported as
  // a defect with the worker's raw "Folder <id> not found" string. The
  // loader only raises the typed error once OPFS confirms the upload is
  // absent, so it's user state: explain it, and keep it out of Sentry.
  it('explains an upload that is not in this browser, and counts it in Sentry as info rather than an error', async () => {
    const goneErr = new UploadNotInBrowserError('12345678-1234-4abc-9def-123456789abc.ifc')
    const loadSpy = jest.spyOn(Loader, 'load').mockImplementation(() => {
      throw goneErr
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const Sentry = require('@sentry/react')
    const captureExceptionSpy = jest.spyOn(Sentry, 'captureException').mockImplementation(() => {})
    const captureMessageSpy = jest.spyOn(Sentry, 'captureMessage').mockImplementation(() => {})
    const {result} = renderHook(() => useStore((state) => state))
    // OPFS present, entry absent. Without this the state leaks in from an
    // earlier no-OPFS test, and the route would raise InMemoryUploadGoneError
    // (#1906) before the loader runs.
    await act(() => result.current.setIsOpfsAvailable(true))
    await act(() => result.current.setModelPath({
      filepath: '12345678-1234-4abc-9def-123456789abc.ifc',
      isUploadedFile: true,
    }))
    render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
    await actAsyncFlush()
    await waitFor(() => {
      const alert = result.current.alert
      expect(alert).toBeTruthy()
      expect(alert.type).toBe('uploadNotInBrowser')
      expect(alert.message).toMatch(/isn't in this browser/)
    })
    expect(captureExceptionSpy).not.toHaveBeenCalledWith(goneErr)
    // …but its volume stays visible in Sentry, as info, in one issue (#1956).
    expect(captureMessageSpy).toHaveBeenCalledWith(
      'Upload not in this browser',
      expect.objectContaining({level: 'info', fingerprint: ['upload-not-in-browser']}))
    // The route's provenance is what lets the loader reclassify at all.
    expect(loadSpy.mock.calls[0][6]).toEqual({isUploadedRoute: true})
  })

  // Same dedupe as a schema refusal: the auth-state effect re-runs the load
  // for the same route, and each re-run must not count again.
  it('counts an upload not in this browser once, even when an auth change reloads it', async () => {
    const loadSpy = jest.spyOn(Loader, 'load').mockImplementation(() => {
      throw new UploadNotInBrowserError('12345678-1234-4abc-9def-123456789abc.ifc')
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const Sentry = require('@sentry/react')
    jest.spyOn(Sentry, 'captureException').mockImplementation(() => {})
    const captureMessageSpy = jest.spyOn(Sentry, 'captureMessage').mockImplementation(() => {})
    const {result} = renderHook(() => useStore((state) => state))
    // OPFS present, entry absent. Without this the state leaks in from an
    // earlier no-OPFS test, and the route would raise InMemoryUploadGoneError
    // (#1906) before the loader runs.
    await act(() => result.current.setIsOpfsAvailable(true))
    await act(() => result.current.setModelPath({
      filepath: '12345678-1234-4abc-9def-123456789abc.ifc',
      isUploadedFile: true,
    }))
    render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
    await actAsyncFlush()
    await waitFor(() => expect(result.current.alert?.type).toBe('uploadNotInBrowser'))
    const loadsBefore = loadSpy.mock.calls.length
    await act(() => result.current.setIsAuthResolved(!result.current.isAuthResolved))
    await actAsyncFlush()
    await waitFor(() => expect(loadSpy.mock.calls.length).toBeGreaterThan(loadsBefore))
    const reports = captureMessageSpy.mock.calls
      .filter(([title]) => title === 'Upload not in this browser')
    expect(reports).toHaveLength(1)
  })

  // A hosted file whose NAME is a UUID looks like an upload to the loader's
  // path heuristic; only the route knows it isn't (codex review on #1956).
  // A private model needs a Bldrs sign-in AND the provider's authorization
  // (design/new/quotas.md §"What counts"). A Drive token in localStorage can
  // outlive the Auth0 session, so a signed-out load must never use it: it
  // takes the API-key path, which only serves link-shared files (codex P1
  // on Share#1977).
  describe('Drive loads and sign-in', () => {
    const DRIVE_ROUTE = {
      kind: 'provider',
      provider: 'google',
      fileId: '1BxDriveFileId00000000000000',
      downloadUrl: new URL('https://www.googleapis.com/drive/v3/files/1BxDriveFileId00000000000000?alt=media&key=k'),
    }
    const DRIVE_CONNECTION = {id: 'gd-1', providerId: 'google-drive', label: 'me@gmail.com', status: 'connected'}
    // Above AUTH_SETTLE_GRACE_MS (2s), which the slow-auth test waits out.
    const GRACE_WAIT_TIMEOUT_MS = 5000
    const RETRY_TEST_TIMEOUT_MS = 15000

    afterEach(() => {
      mockAuthState.isAuthenticated = false
      act(() => useStore.setState({connections: []}))
    })

    /** @return {Promise<{loadSpy: object, getFileDownload: object}>} after CadView's first load attempt */
    async function loadDriveRoute() {
      const registry = require('../connections/registry')
      const getFileDownload = jest.fn().mockResolvedValue({blob: new Blob(['ifc'])})
      jest.spyOn(registry, 'getBrowser').mockReturnValue({getFileDownload})
      const loadSpy = jest.spyOn(Loader, 'load').mockImplementation(() => {
        throw new Error('stop after the call')
      })
      jest.spyOn(console, 'error').mockImplementation(() => {})
      const Sentry = require('@sentry/react')
      jest.spyOn(Sentry, 'captureException').mockImplementation(() => {})
      const {result} = renderHook(() => useStore((state) => state))
      await act(() => {
        // onViewer only starts once OPFS availability is known.
        result.current.setIsOpfsAvailable(false)
        result.current.setIsAuthResolved(true)
        useStore.setState({connections: [DRIVE_CONNECTION]})
        result.current.setModelPath(DRIVE_ROUTE)
      })
      render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
      await actAsyncFlush()
      await waitFor(() => expect(loadSpy).toHaveBeenCalled())
      return {loadSpy, getFileDownload}
    }

    it('signed out, never downloads through a Drive connection: it loads by API key', async () => {
      const {loadSpy, getFileDownload} = await loadDriveRoute()
      expect(getFileDownload).not.toHaveBeenCalled()
      expect(loadSpy.mock.calls[0][0]).toBe(DRIVE_ROUTE.downloadUrl)
    })

    // Auth0 slower than onViewerInternal's grace: the first attempt reads as
    // signed out and goes by API key, which a restricted file refuses. Once
    // auth settles signed in, the load is retried through the connection
    // instead of staying failed until a reload (codex review on Share#1977).
    it('retries through the Drive connection when sign-in settles after the grace', async () => {
      const registry = require('../connections/registry')
      const getFileDownload = jest.fn().mockResolvedValue({blob: new Blob(['ifc'])})
      jest.spyOn(registry, 'getBrowser').mockReturnValue({getFileDownload})
      // The API-key download is still in flight when auth settles, which is
      // what drops the auth-state effect's own re-run (its onViewer finds a
      // load in flight): only loadModelWithAuthRetry can recover it.
      let refuseApiKeyDownload
      const apiKeyDownload = new Promise((resolve, reject) => {
        refuseApiKeyDownload = () => reject(new Error('restricted: the API key cannot read it'))
      })
      const loadSpy = jest.spyOn(Loader, 'load')
        .mockImplementationOnce(() => apiKeyDownload)
        .mockImplementation(() => {
          throw new Error('stop after the call')
        })
      jest.spyOn(console, 'error').mockImplementation(() => {})
      const Sentry = require('@sentry/react')
      jest.spyOn(Sentry, 'captureException').mockImplementation(() => {})
      const {result} = renderHook(() => useStore((state) => state))
      await act(() => {
        result.current.setIsOpfsAvailable(false)
        result.current.setIsAuthResolved(false)
        useStore.setState({connections: [DRIVE_CONNECTION]})
        result.current.setModelPath(DRIVE_ROUTE)
      })
      const ui = <ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>
      const {rerender} = render(ui)
      // The grace (AUTH_SETTLE_GRACE_MS, 2s) runs out unsettled.
      await waitFor(() => expect(loadSpy).toHaveBeenCalledTimes(1), {timeout: GRACE_WAIT_TIMEOUT_MS})
      expect(loadSpy.mock.calls[0][0]).toBe(DRIVE_ROUTE.downloadUrl)
      expect(getFileDownload).not.toHaveBeenCalled()

      // Auth0 lands signed in, then BaseRoutes settles auth — in that order,
      // as in the app.
      mockAuthState.isAuthenticated = true
      rerender(ui)
      await act(() => result.current.setIsAuthResolved(true))
      await actAsyncFlush()
      await act(async () => {
        refuseApiKeyDownload()
        await apiKeyDownload.catch(() => {})
      })

      await waitFor(() => expect(getFileDownload).toHaveBeenCalledWith(DRIVE_CONNECTION, null, DRIVE_ROUTE.fileId))
      await waitFor(() => expect(loadSpy).toHaveBeenCalledTimes(2))
      expect(loadSpy.mock.calls[1][0]).not.toBe(DRIVE_ROUTE.downloadUrl)
    }, RETRY_TEST_TIMEOUT_MS)

    it('signed in, downloads through the Drive connection', async () => {
      mockAuthState.isAuthenticated = true
      const {loadSpy, getFileDownload} = await loadDriveRoute()
      expect(getFileDownload).toHaveBeenCalledWith(DRIVE_CONNECTION, null, DRIVE_ROUTE.fileId)
      expect(loadSpy.mock.calls[0][0]).not.toBe(DRIVE_ROUTE.downloadUrl)
    })
  })

  it('tells the loader a hosted UUID-named file is not an upload route', async () => {
    const loadSpy = jest.spyOn(Loader, 'load').mockImplementation(() => {
      throw new Error('stop after the call')
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const Sentry = require('@sentry/react')
    jest.spyOn(Sentry, 'captureException').mockImplementation(() => {})
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setModelPath({
      filepath: '12345678-1234-4abc-9def-123456789abc.ifc',
      isUploadedFile: false,
    }))
    render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
    await actAsyncFlush()
    await waitFor(() => expect(loadSpy).toHaveBeenCalled())
    expect(loadSpy.mock.calls[0][6]).toEqual({isUploadedRoute: false})
  })

  // A model change that lands while another load is in flight is not a
  // duplicate to drop: the in-flight guard used to skip it, leaving the URL
  // on the new model while nothing loaded it. A no-OPFS local open reaches
  // this by navigating in-app instead of a page load (#1906, codex review on
  // #1957), so it is replayed once the in-flight load ends.
  it('loads a model the path changed to while another load was in flight', async () => {
    let failFirstLoad
    const loadSpy = jest.spyOn(Loader, 'load')
      .mockImplementationOnce(() => new Promise((resolve, reject) => {
        failFirstLoad = reject
      }))
      .mockImplementation(() => new Promise(() => {}))
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const Sentry = require('@sentry/react')
    jest.spyOn(Sentry, 'captureException').mockImplementation(() => {})
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setAlert(null))
    await act(() => result.current.setIsOpfsAvailable(false))
    await act(() => result.current.setModelPath({filepath: '/index.ifc'}))
    render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
    await actAsyncFlush()
    await waitFor(() => expect(loadSpy).toHaveBeenCalledTimes(1))

    // Mid-load, the user opens another model.
    await act(() => result.current.setModelPath({filepath: '/other.ifc'}))
    await actAsyncFlush()
    expect(loadSpy).toHaveBeenCalledTimes(1)

    await act(() => failFirstLoad(new Error('first load ends')))
    await actAsyncFlush()
    await waitFor(() => expect(loadSpy).toHaveBeenCalledTimes(2))
    expect(String(loadSpy.mock.calls[1][0])).toContain('other.ifc')
    // The superseded load's failure is about a model the user left; its
    // alert must not sit over the replayed one, whose OK would navigate home.
    expect(result.current.alert).toBeNull()
  })

  // Without OPFS a local file lives only in the memory of the page that
  // opened it (#1906). A /v/new/ route this page doesn't hold — a reload, or
  // the link opened elsewhere — says so instead of fetching a blob URL that
  // never existed here, and stays out of Sentry.
  it('explains a /v/new/ upload this page no longer holds, without loading or reporting it', async () => {
    resetInMemoryUploadsForTest()
    const loadSpy = jest.spyOn(Loader, 'load')
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const Sentry = require('@sentry/react')
    const captureExceptionSpy = jest.spyOn(Sentry, 'captureException').mockImplementation(() => {})
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setIsOpfsAvailable(false))
    await act(() => result.current.setModelPath({
      kind: 'file', isUploadedFile: true, filepath: '4be9c3dc-e138-47e9-962b-d0cf55cbbc26.ifc'}))
    render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix='/v/new'/></ShareMock>)
    await actAsyncFlush()
    await waitFor(() => expect(result.current.alert).toEqual(inMemoryUploadGoneAlert()))
    expect(loadSpy).not.toHaveBeenCalled()
    expect(captureExceptionSpy).not.toHaveBeenCalledWith(expect.any(InMemoryUploadGoneError))
  })

  it('loads a /v/new/ upload this page holds in memory', async () => {
    resetInMemoryUploadsForTest()
    const storageId = registerInMemoryUpload(new File([], 'box.ifc'), 'ifc')
    // Reaching the Loader is the point; what it does with the bytes is
    // Loader.inMemoryUpload.test.js's.
    const loadSpy = jest.spyOn(Loader, 'load').mockImplementation(() => new Promise(() => {}))
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setAlert(null))
    await act(() => result.current.setIsOpfsAvailable(false))
    await act(() => result.current.setModelPath({kind: 'file', isUploadedFile: true, filepath: storageId}))
    render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix='/v/new'/></ShareMock>)
    await actAsyncFlush()
    await waitFor(() => expect(loadSpy).toHaveBeenCalled())
    expect(loadSpy.mock.calls[0][0]).toContain(storageId)
    expect(result.current.alert).toBeNull()
  })

  // The auth-state effect re-runs onViewer for the same route after a
  // refusal (isViewerLoaded stays false on failure). Each re-run is refused
  // again, but must not be counted again: the counts are the demand signal
  // (codex review of Share#1899).
  it('counts a refused model once, even when an auth change reloads it', async () => {
    const schemaErr = new UnsupportedSchemaError('IFC4X3_RC2')
    const loadSpy = jest.spyOn(Loader, 'load').mockImplementation(() => {
      throw schemaErr
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const Sentry = require('@sentry/react')
    jest.spyOn(Sentry, 'captureException').mockImplementation(() => {})
    const captureMessageSpy = jest.spyOn(Sentry, 'captureMessage').mockImplementation(() => {})
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
    render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
    await actAsyncFlush()
    await waitFor(() => expect(result.current.alert?.type).toBe('unsupportedSchema'))
    const loadsBefore = loadSpy.mock.calls.length
    await act(() => result.current.setIsAuthResolved(!result.current.isAuthResolved))
    await actAsyncFlush()
    // The reload really happened, so the single count below is the dedupe
    // at work and not a reload that never ran.
    await waitFor(() => expect(loadSpy.mock.calls.length).toBeGreaterThan(loadsBefore))
    const refusalReports = captureMessageSpy.mock.calls
      .filter(([title]) => title === 'Unsupported IFC schema: IFC4X3_RC2')
    expect(refusalReports).toHaveLength(1)
  })

  // Same dedupe, for the other rerun trigger: view settings from the Widget
  // API re-run the load for the same model.
  it('counts a refused model once, even when view settings reload it', async () => {
    const schemaErr = new UnsupportedSchemaError('IFC4X3_RC2')
    const loadSpy = jest.spyOn(Loader, 'load').mockImplementation(() => {
      throw schemaErr
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const Sentry = require('@sentry/react')
    jest.spyOn(Sentry, 'captureException').mockImplementation(() => {})
    const captureMessageSpy = jest.spyOn(Sentry, 'captureMessage').mockImplementation(() => {})
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
    render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
    await actAsyncFlush()
    await waitFor(() => expect(result.current.alert?.type).toBe('unsupportedSchema'))
    const loadsBefore = loadSpy.mock.calls.length
    await act(() => result.current.setCustomViewSettings({foo: 'bar'}))
    await actAsyncFlush()
    await waitFor(() => expect(loadSpy.mock.calls.length).toBeGreaterThan(loadsBefore))
    const refusalReports = captureMessageSpy.mock.calls
      .filter(([title]) => title === 'Unsupported IFC schema: IFC4X3_RC2')
    expect(refusalReports).toHaveLength(1)
  })

  // Share#1954: GA must see loads that fail and loads that display nothing,
  // not only the ones that succeed.
  describe('load outcome analytics (Share#1954)', () => {
    let loadSpy

    /** @return {Array<[string, object]>} [name, params] of every gtag event sent */
    function gaEvents() {
      return window.gtag.mock.calls.map(([, name, params]) => [name, params])
    }

    beforeEach(() => {
      window.gtag = jest.fn()
      // '../Filetype' is automocked for this whole file, which leaves
      // supportedTypes empty; load_failed's content_type is allowlisted
      // against it, so seed the one format these tests load.
      Filetype.supportedTypes.push('ifc')
      jest.spyOn(console, 'error').mockImplementation(() => {})
      const Sentry = require('@sentry/react')
      jest.spyOn(Sentry, 'captureException').mockImplementation(() => {})
    })

    afterEach(() => {
      delete window.gtag
      Filetype.supportedTypes.splice(0)
      // Each test spies Loader.load differently; a spy left over would feed
      // the next test the previous one's failure. Only this one is restored:
      // restoreAllMocks would also reset the file-level jest.fn() doubles.
      loadSpy?.mockRestore()
      loadSpy = undefined
    })

    it('sends exactly one load_failed, with closed-set params and no free text', async () => {
      loadSpy = jest.spyOn(Loader, 'load').mockImplementation(() => {
        throw new Error('OpenModel returned -1 for /private/secret-house.ifc')
      })
      const {result} = renderHook(() => useStore((state) => state))
      await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
      render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
      await actAsyncFlush()
      await waitFor(() => expect(result.current.alert).not.toBeNull())
      const failures = gaEvents().filter(([name]) => name === 'load_failed')
      expect(failures).toEqual([['load_failed', {
        content_type: 'ifc',
        size_bucket: 'unknown',
        reason_class: 'parse',
        last_phase: 'none',
      }]])
      expect(JSON.stringify(failures)).not.toContain('secret')
      expect(gaEvents().filter(([name]) => name === 'real_model_open')).toHaveLength(0)
    })

    // The success half (real_model_open's load_outcome and timings) cannot
    // run here: this file's ShareViewer double shares one ThreeContext across
    // tests and the first unmount disposes it, so loadModel never gets past
    // `viewer.context.getScene()`. That half is pinned by
    // loadAnalytics.test.js (the param assembly), loadProgress.test.js (the
    // reporter) and realModelOpen.spec.ts (the real pipeline in a browser).

    // The auth-state effect re-runs onViewer for the same route after a
    // failure (isViewerLoaded stays false). One user open is one failure.
    it('sends one load_failed for a model, even when an auth change reloads it', async () => {
      loadSpy = jest.spyOn(Loader, 'load').mockImplementation(() => {
        throw new Error('OpenModel returned -1')
      })
      const {result} = renderHook(() => useStore((state) => state))
      await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
      render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
      await actAsyncFlush()
      await waitFor(() => expect(gaEvents().filter(([name]) => name === 'load_failed')).toHaveLength(1))
      const loadsBefore = loadSpy.mock.calls.length
      await act(() => result.current.setIsAuthResolved(!result.current.isAuthResolved))
      await actAsyncFlush()
      // The reload really happened, so the single event below is the dedupe
      // at work and not a reload that never ran.
      await waitFor(() => expect(loadSpy.mock.calls.length).toBeGreaterThan(loadsBefore))
      expect(gaEvents().filter(([name]) => name === 'load_failed')).toHaveLength(1)
    })

    // The [modelPath, customViewSettings] effect re-runs the load for the
    // same model when the Widget API changes view settings.
    it('sends one load_failed for a model, even when view settings reload it', async () => {
      loadSpy = jest.spyOn(Loader, 'load').mockImplementation(() => {
        throw new Error('OpenModel returned -1')
      })
      const {result} = renderHook(() => useStore((state) => state))
      await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
      render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
      await actAsyncFlush()
      await waitFor(() => expect(gaEvents().filter(([name]) => name === 'load_failed')).toHaveLength(1))
      const loadsBefore = loadSpy.mock.calls.length
      await act(() => result.current.setCustomViewSettings({foo: 'bar'}))
      await actAsyncFlush()
      await waitFor(() => expect(loadSpy.mock.calls.length).toBeGreaterThan(loadsBefore))
      expect(gaEvents().filter(([name]) => name === 'load_failed')).toHaveLength(1)
    })

    it('sends load_failed again for a different model', async () => {
      loadSpy = jest.spyOn(Loader, 'load').mockImplementation(() => {
        throw new Error('OpenModel returned -1')
      })
      const {result} = renderHook(() => useStore((state) => state))
      await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
      render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
      await actAsyncFlush()
      await waitFor(() => expect(gaEvents().filter(([name]) => name === 'load_failed')).toHaveLength(1))
      await act(() => result.current.setModelPath({filepath: `/other.ifc`}))
      await actAsyncFlush()
      await waitFor(() => expect(gaEvents().filter(([name]) => name === 'load_failed')).toHaveLength(2))
    })

    // A fails, a model that reports nothing opens (the demo is excluded from
    // load_failed), A fails again: that is a second open of A. Without the
    // reset on a model change, A's key was still held and the event dropped.
    it('sends load_failed again when a model is reopened after another one', async () => {
      loadSpy = jest.spyOn(Loader, 'load').mockImplementation(() => {
        throw new Error('OpenModel returned -1')
      })
      const {result} = renderHook(() => useStore((state) => state))
      await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
      render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
      await actAsyncFlush()
      await waitFor(() => expect(gaEvents().filter(([name]) => name === 'load_failed')).toHaveLength(1))
      const loadsBeforeDemo = loadSpy.mock.calls.length
      await act(() => result.current.setModelPath({kind: 'file', isUploadedFile: false, filepath: 'index.ifc'}))
      await actAsyncFlush()
      await waitFor(() => expect(loadSpy.mock.calls.length).toBeGreaterThan(loadsBeforeDemo))
      expect(gaEvents().filter(([name]) => name === 'load_failed')).toHaveLength(1)
      const loadsBeforeA = loadSpy.mock.calls.length
      await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
      await actAsyncFlush()
      await waitFor(() => expect(loadSpy.mock.calls.length).toBeGreaterThan(loadsBeforeA))
      await waitFor(() => expect(gaEvents().filter(([name]) => name === 'load_failed')).toHaveLength(2))
    })

    it('classifies a refused schema as unsupported_schema', async () => {
      loadSpy = jest.spyOn(Loader, 'load').mockImplementation(() => {
        throw new UnsupportedSchemaError('IFC4X3_RC2')
      })
      const Sentry = require('@sentry/react')
      jest.spyOn(Sentry, 'captureMessage').mockImplementation(() => {})
      const {result} = renderHook(() => useStore((state) => state))
      await act(() => result.current.setModelPath({filepath: `/index.ifc`}))
      render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
      await actAsyncFlush()
      await waitFor(() => expect(result.current.alert?.type).toBe('unsupportedSchema'))
      expect(gaEvents().find(([name]) => name === 'load_failed')[1].reason_class)
        .toBe('unsupported_schema')
    })

    it('does not report a failure to load the bundled demo model', async () => {
      loadSpy = jest.spyOn(Loader, 'load').mockImplementation(() => {
        throw new Error('OpenModel returned -1')
      })
      const {result} = renderHook(() => useStore((state) => state))
      await act(() => result.current.setModelPath({kind: 'file', isUploadedFile: false, filepath: 'index.ifc'}))
      render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
      await actAsyncFlush()
      await waitFor(() => expect(result.current.alert).not.toBeNull())
      expect(gaEvents().filter(([name]) => name === 'load_failed')).toHaveLength(0)
    })

    it('does not borrow the previous load\'s phase for a failure before any load began', async () => {
      resetInMemoryUploadsForTest()
      const {result} = renderHook(() => useStore((state) => state))
      await act(() => result.current.setIsOpfsAvailable(false))
      await act(() => result.current.setModelPath({
        kind: 'file', isUploadedFile: true, filepath: '4be9c3dc-e138-47e9-962b-d0cf55cbbc26.ifc'}))
      render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix='/v/new'/></ShareMock>)
      await actAsyncFlush()
      await waitFor(() => expect(result.current.alert).toEqual(inMemoryUploadGoneAlert()))
      // Thrown before beginLoadProgress ran for this attempt: no phase, no
      // size and no format, whatever an earlier test's reporter left behind.
      expect(gaEvents().filter(([name]) => name === 'load_failed')).toEqual([['load_failed', {
        content_type: 'unknown',
        size_bucket: 'unknown',
        reason_class: 'other',
        last_phase: 'none',
      }]])
    })
  })

  // State that belongs to one model must not outlive it in a CadView that
  // stays mounted across a model switch. Latent while opening a model reloads
  // the page; reachable once it doesn't (open-205, #2021).
  describe('after switching away from a model that loaded (open-205)', () => {
    let getHarness
    let loadSpy
    let cameraControlsSpy

    beforeEach(() => {
      getHarness = require('../../__mocks__/shareViewerTestHarness').__getShareViewerMockSingleton
      jest.spyOn(console, 'error').mockImplementation(() => {})
      const Sentry = require('@sentry/react')
      jest.spyOn(Sentry, 'captureException').mockImplementation(() => {})
      // A's load can finish on a viewer the mount has already disposed (a
      // pre-existing race, open-205 #2019), whose context then hands back no
      // camera controls, and the tail of onViewerInternal throws. Sidestep
      // it: these tests are about what happens after A has loaded.
      cameraControlsSpy = jest.spyOn(ThreeContext.prototype, 'getCameraControls')
        .mockImplementation(() => getHarness().IFC.context.ifcCamera.cameraControls)
      // Earlier tests in this file leave view settings and auth state behind;
      // either one re-runs a load on its own and muddies the counts below.
      useStore.setState({
        alert: null, customViewSettings: null, isAuthResolved: false, isModelReady: false,
        expandedElements: [], selectedElements: [], selectedAnchorIds: [], selectedOccurrencePath: null,
      })
    })

    afterEach(() => {
      cameraControlsSpy.mockRestore()
      loadSpy?.mockRestore()
      loadSpy = undefined
    })

    /**
     * Mount CadView on A (`/index.ifc`, the harness's a → b → c tree), let it
     * load, then switch to B (`/other.ifc`), whose loads run `laterLoad`.
     *
     * @param {object} result renderHook result over the whole store
     * @param {Function} laterLoad Loader.load implementation for B
     */
    async function loadAThenSwitchToB(result, laterLoad) {
      loadSpy = jest.spyOn(Loader, 'load')
        .mockImplementationOnce(() => Promise.resolve(getHarness()._loadedModel))
        .mockImplementation(laterLoad)
      await act(() => result.current.setIsOpfsAvailable(false))
      await act(() => result.current.setModelPath({filepath: '/index.ifc'}))
      render(<ShareMock><CadView installPrefix='' appPrefix='' pathPrefix=''/></ShareMock>)
      await actAsyncFlush()
      await waitFor(() => expect(result.current.isModelReady).toBe(true))
      await act(() => result.current.setModelPath({filepath: '/other.ifc'}))
      await actAsyncFlush()
    }

    // #2015: `isViewerLoaded` gates the auth/OPFS retry effect. Set by A's
    // success and never cleared, it silenced that effect for every later
    // model, so a B whose first attempt failed (e.g. a private GitHub file
    // tried before auth settled) was never retried.
    it('retries the new model on an auth change', async () => {
      const {result} = renderHook(() => useStore((state) => state))
      await loadAThenSwitchToB(result, () => {
        throw new Error('OpenModel returned -1')
      })
      await waitFor(() => expect(result.current.alert).not.toBeNull())
      const loadsBefore = loadSpy.mock.calls.length
      await act(() => result.current.setIsAuthResolved(!result.current.isAuthResolved))
      await actAsyncFlush()
      await waitFor(() => expect(loadSpy.mock.calls.length).toBeGreaterThan(loadsBefore))
      expect(String(loadSpy.mock.calls.at(-1)[0])).toContain('other.ifc')
    })

    // #2016: the element lookup table is per model. Never cleared, A's ids
    // still resolved while B loaded, so selecting one opened A's ancestors in
    // the NavTree (and A's whole tree stayed reachable).
    it('no longer resolves the old model\'s element ids', async () => {
      const {result} = renderHook(() => useStore((state) => state))
      // B never finishes, so nothing of B's refills the table.
      await loadAThenSwitchToB(result, () => new Promise(() => {}))
      const leafOfA = makeTestTree().children[0].children[0].expressID
      await act(() => result.current.setExpandedElements([]))
      await act(() => result.current.setSelectedElements([`${leafOfA}`]))
      await actAsyncFlush()
      // The selection effect has run to the end: it sets the properties and
      // then the NavTree expansion.
      await waitFor(() => expect(result.current.selectedElement).toBeTruthy())
      await actAsyncFlush()
      expect(result.current.expandedElements).toEqual([])
    })
  })


  // TODO(https://github.com/bldrs-ai/Share/issues/622): SceneLayer breaks postprocessing
  /*
  import {__getShareViewerMockSingleton} from '../../__mocks__/shareViewerTestHarness'
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
