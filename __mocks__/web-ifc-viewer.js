jest.mock('three')
jest.mock('../src/viewer/three/IfcHighlighter')
jest.mock('../src/viewer/three/IfcIsolator')
jest.mock('../src/viewer/three/CustomPostProcessor')
// Slice 5d.3: ShareViewer now instantiates `IfcContext` (vendored at
// `src/viewer/three/context/`) and `makeForkIfc(ifcContext)` directly
// (was `new IfcViewerAPI(options)`). The auto-mock-on-`from
// 'web-ifc-viewer'`-import flow this file uses doesn't cover those
// source modules; mock them here too. Load order is: ShareViewer.js
// does `import 'web-ifc-viewer'` FIRST, which triggers this file
// to load, which registers the jest.mock factories below. By the time
// ShareViewer's later `import {IfcContext} from './three/context'`
// resolves, the factory is registered and Jest uses it.
//
// The factories route through `globalThis` rather than capturing
// `impl` / `legacyContextMock` directly because babel-plugin-jest-hoist
// places the factory bodies in a separate lexical scope. Capturing the
// consts produced a second `impl` reference and broke the singleton
// invariant `viewer.IFC === __getShareViewerMockSingleton().IFC`.
// Routing via `globalThis` ensures both this file's exports and the
// factory closures resolve to the same backing objects.
jest.mock('../src/viewer/three/context', () => ({
  IfcContext: jest.fn().mockImplementation(
    () => globalThis.__BLDRS_MOCK_LEGACY_CTX__),
}))
jest.mock('../src/viewer/three/forkIfcComposition', () => ({
  makeForkIfc: jest.fn(() => ({
    IFC: globalThis.__BLDRS_MOCK_IMPL__.IFC,
  })),
}))
const ifcjsMock = jest.createMockFromModule('web-ifc-viewer')
const ThreeContext = require('../src/viewer/three/ThreeContext').default


// Not sure why this is required, but otherwise these internal fields
// are not present in the instantiated ShareViewer.
const loadedModel = {
  ifcManager: {
    getSpatialStructure: jest.fn(),
    getProperties: jest.fn((eltId) => ({})),
  },
  getIfcType: jest.fn(),
  geometry: {
    boundingBox: {
      getCenter: jest.fn(),
    },
    attributes: {
      expressID: 123,
    },
  },
}

const legacyContextMock = {
  fitToFrame: jest.fn(),
  getCamera: jest.fn(() => {
    return {
      currentNavMode: {
        fitModelToFrame: jest.fn(),
      },
    }
  }),
  getClippingPlanes: jest.fn(() => {
    return []
  }),
  // Slice 5d.3: every ShareViewer instance now wraps the same
  // legacyContextMock in its own ThreeContext, so reaching for
  // `viewer.context.getDomElement` from one ShareViewer no longer
  // affects another. Return a real `<div>` so callers that touch
  // `.style.touchAction` (PlaceMark) or `.dispatchEvent` (drag-drop)
  // see a usable DOM element straight from the singleton mock.
  getDomElement: jest.fn(() => (typeof document !== 'undefined' ?
    document.createElement('div') :
    {setAttribute: () => {}, addEventListener: () => {}, removeEventListener: () => {}, style: {}})),
  getRenderer: jest.fn(),
  getScene: jest.fn(() => {
    return {
      add: jest.fn(),
    }
  }),
  ifcCamera: {
    cameraControls: {
      addEventListener: jest.fn(),
      setPosition: jest.fn((x, y, z) => {
        return {}
      }),
      getPosition: jest.fn((x, y, z) => {
        const position = [0, 0, 0]
        return position
      }),
      setTarget: jest.fn((x, y, z) => {
        return {}
      }),
      getTarget: jest.fn((x, y, z) => {
        const target = [0, 0, 0]
        return target
      }),
    },
    currentNavMode: {
      fitModelToFrame: jest.fn(),
    },
  },
  items: {
    ifcModels: [],
    pickableIfcModels: [],
  },
  mouse: {position: {x: 0, y: 0}},
  renderer: {
    newScreenshot: jest.fn(),
    update: jest.fn(),
  },
  resize: jest.fn(),
  dispose: jest.fn(),
}
// Production wraps `viewer.context` in a ThreeContext (see
// src/viewer/three/ThreeContext.js). Mirror that here so the singleton
// from `__getShareViewerMockSingleton()` exposes the same
// surface as production.
const contextMock = new ThreeContext(legacyContextMock)

const impl = {
  _isMock: true,
  _loadedModel: loadedModel,
  IFC: {
    addIfcModel: jest.fn(),
    // Mirrors production: the fork's IfcManager holds the raw legacy
    // IfcContext; only `viewer.context` is the ThreeContext wrapper.
    context: legacyContextMock,
    setWasmPath: jest.fn(),
    // Post-slice-5c: ShareViewer.getProperties delegates to
    // `this.IFC.getProperties`. Pre-5c the convenience method came
    // from `IfcViewerAPI.prototype.getProperties` via `extends`, and
    // the singleton mock shadowed it with the top-level
    // `impl.getProperties` below — composition severs that shadow, so
    // we mirror the production shape here too.
    getProperties: jest.fn((modelId, eltId) => {
      return loadedModel.ifcManager.getProperties(eltId)
    }),
    selector: {
      unpickIfcItems: jest.fn(),
      selection: {
        meshes: [],
        material: null,
      },
      preselection: {
        material: null,
      },
    },
    loader: {
      ifcManager: {
        applyWebIfcConfig: jest.fn(),
        ifcAPI: {
          // Slice 5b: Conway-direct parse calls OpenModel +
          // StreamAllMeshes directly. The empty-StreamAllMeshes
          // path produces an empty Conway-direct Mesh, which is
          // enough for unit tests that only verify the load
          // pipeline shape (not the actual geometry).
          OpenModel: jest.fn(() => 0),
          StreamAllMeshes: jest.fn(() => {}),
          GetCoordinationMatrix: jest.fn(() => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
          getConwayVersion: jest.fn(),
          getStatistics: jest.fn(() => {
            return {
              getGeometryMemory: jest.fn(),
              getGeometryTime: jest.fn(),
              getLoadStatus: jest.fn(),
              getOriginatingSystem: jest.fn(),
              getParseTime: jest.fn(),
              getPreprocessorVersion: jest.fn(),
              getTotalTime: jest.fn(),
              getVersion: jest.fn(),
            }
          }),
          // Conway's `properties` namespace — the Conway-direct
          // model methods route reads through here. Stubs return
          // empty so tests that don't probe properties still pass;
          // tests that DO probe should mock per-test.
          properties: {
            getItemProperties: jest.fn(),
            getPropertySets: jest.fn(),
            getSpatialStructure: jest.fn(),
            getIfcType: jest.fn(),
          },
        },
        parser: {},
        setupCoordinationMatrix: jest.fn(),
        state: {},
      },
      parse: jest.fn(() => loadedModel),
    },
  },
  // Mirrors the surface of `viewer/three/Clipper.js` — the in-repo
  // cut-plane plugin (slice 5d.2 dropped the fork's `IfcClipper`; the
  // plugin builds a `MeshClipper` per model). The methods below are
  // no-op stubs sized to what CutPlaneMenu / viewer.js / shortcutKeys
  // consume.
  clipper: {
    active: false,
    orthogonalY: false,
    clickDrag: false,
    deleteAllPlanes: jest.fn(() => {
      return 'cutPlane'
    }),
    setInteractionEnabled: jest.fn(),
    setModel: jest.fn(),
    createPlane: jest.fn(),
    deletePlane: jest.fn(),
    dispose: jest.fn(),
    // The real Clipper's `context` getter is always undefined now (the
    // fork escape hatch is gone); kept so `CutPlaneMenu.removePlanes`
    // reads a defined slot.
    context: undefined,
    createFromNormalAndCoplanarPoint: jest.fn(() => {
      return 'createFromNormalAndCoplanarPoint'
    }),
    planes: [{
      plane: {
        normal: jest.fn(),
        constant: 10,
      },
    }],
  },
  container: {
    style: {},
  },
  context: contextMock,
  loadIfcUrl: jest.fn(jest.fn(() => loadedModel)),
  loadIfcFile: jest.fn(jest.fn(() => loadedModel)),
  getProperties: jest.fn((modelId, eltId) => {
    return loadedModel.ifcManager.getProperties(eltId)
  }),
  pickIfcItemsByID: jest.fn(),
  preselectElementsByIds: jest.fn(),
  setSelection: jest.fn(),
  setInstanceSelection: jest.fn(),
  setCustomViewSettings: jest.fn(),
  takeScreenshot: jest.fn(),
}
const constructorMock = ifcjsMock.IfcViewerAPI
constructorMock.mockImplementation(() => impl)

// This file loads more than once per test run (auto-mock invocation
// plus the explicit `import 'web-ifc-viewer'` from ShareViewer go
// through separate module instances). Without dedup, each load builds
// a new `impl` and stomps `globalThis.__BLDRS_MOCK_IMPL__`, so the
// jest.mock factories at the top would resolve to a different `impl`
// than `__getShareViewerMockSingleton()` returns — breaking the
// invariant `viewer.IFC === singleton.IFC`. Keep only the first load's
// impl/legacy on globalThis.
if (!globalThis.__BLDRS_MOCK_IMPL__) {
  globalThis.__BLDRS_MOCK_IMPL__ = impl
  globalThis.__BLDRS_MOCK_LEGACY_CTX__ = legacyContextMock
}


/**
 * Deferred accessors for the `jest.mock(...)` factories at the top of
 * this file. The `mock` name prefix is required by babel-plugin-jest-
 * hoist: the factory closures get hoisted above the `impl` /
 * `legacyContextMock` const declarations, so they can't capture those
 * consts directly — only `mock`-prefixed identifiers are allow-listed
 * for out-of-scope reference. These function declarations ARE hoisted
 * (JS function hoisting), and by the time a factory actually runs (when
 * ShareViewer first requires `./three/context` etc.) the consts are
 * populated.
 *
 * @return {object} the singleton mock `impl`.
 */
function mockGetImpl() {
  return impl
}


/**
 * @return {object} the raw fork-style IfcContext mock (pre-ThreeContext-wrap).
 */
function mockGetLegacyContext() {
  return legacyContextMock
}


/**
 * @return {object} The single mock instance of ShareViewer. Routes
 *   through `globalThis.__BLDRS_MOCK_IMPL__` for the same load-dedup
 *   reason as the jest.mock factories above (this file loads more than
 *   once per test run; only the first load's `impl` lives on
 *   globalThis, and we want every consumer to converge on it).
 */
function __getShareViewerMockSingleton() {
  return globalThis.__BLDRS_MOCK_IMPL__ ?? impl
}


export {
  ifcjsMock as default,
  constructorMock as IfcViewerAPI,
  __getShareViewerMockSingleton as __getShareViewerMockSingleton,
}
