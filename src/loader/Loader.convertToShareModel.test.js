/* eslint-disable no-magic-numbers */
// Focused tests for Loader.js#convertToShareModel — specifically the
// Phase 2b picking-fix: detection of a GLB-cache-roundtripped per-vertex
// `_expressid` attribute and preservation as `expressID` so web-ifc-three's
// stock `IFCLoader#getExpressId` works without modification. Older
// (mesh-level / no per-vertex IDs) paths must continue to behave as before.

import {BufferAttribute, BufferGeometry, Mesh, Scene} from 'three'
import {__sanitizeCachedTitleForTest, convertToShareModel} from './Loader'
import {encodeElementProperties, makeElementPropertiesPayload} from './bldrsElementProperties'
import {decorateShareModel, inferModelCapabilities} from '../viewer/ShareModel'
import {attachElementSubsets} from '../viewer/three/elementSubsets'


/**
 * Build a minimal viewer-like object with the `IFC.loader.ifcManager`
 * surface convertToShareModel reaches into. Captures the
 * `getExpressId` writeback for assertions.
 *
 * @return {object}
 */
function makeViewerStub() {
  return {
    IFC: {
      loader: {
        ifcManager: {
          getExpressId: jest.fn(() => 99 /* stock impl, unmodified */),
          getSpatialStructure: jest.fn(),
        },
      },
    },
  }
}


/**
 * @param {object} attrs map of {attributeName: BufferAttribute}
 * @return {Mesh}
 */
function makeMesh(attrs) {
  const geom = new BufferGeometry()
  for (const [name, attr] of Object.entries(attrs)) {
    geom.setAttribute(name, attr)
  }
  return new Mesh(geom)
}


describe('Loader/convertToShareModel — Phase 2b picking-fix', () => {
  it('preserves per-vertex _expressid by renaming to expressID', () => {
    const ids = new Int32Array([100, 100, 100, 200, 200, 200]) // 2 triangles, 2 elements
    const mesh = makeMesh({_expressid: new BufferAttribute(ids, 1)})
    const viewer = makeViewerStub()
    const stockGetExpressId = viewer.IFC.loader.ifcManager.getExpressId

    convertToShareModel(mesh, viewer)

    expect(mesh.geometry.attributes.expressID).toBeDefined()
    expect(mesh.geometry.attributes.expressID.count).toBe(6)
    expect(Array.from(mesh.geometry.attributes.expressID.array))
      .toEqual([100, 100, 100, 200, 200, 200])
    // `_expressid` is gone (we renamed, not copied).
    expect(mesh.geometry.attributes._expressid).toBeUndefined()
    // The manager's stock getExpressId was NOT overridden — picking on
    // this and future models now goes through web-ifc-three's real impl.
    expect(viewer.IFC.loader.ifcManager.getExpressId).toBe(stockGetExpressId)
  })

  it('falls back to synthetic 1-byte expressID when no per-vertex source exists', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
    const mesh = makeMesh({position: new BufferAttribute(positions, 3)})
    const viewer = makeViewerStub()
    const stockGetExpressId = viewer.IFC.loader.ifcManager.getExpressId

    convertToShareModel(mesh, viewer)

    // Synthetic 1-byte attribute matches the legacy behavior callers
    // (OBJ / STL / direct .glb upload) depend on.
    expect(mesh.geometry.attributes.expressID).toBeDefined()
    expect(mesh.geometry.attributes.expressID.count).toBe(1)
    // The manager's getExpressId WAS overridden — the legacy fallback
    // returning `geom.id` is still what unstructured models get.
    expect(viewer.IFC.loader.ifcManager.getExpressId).not.toBe(stockGetExpressId)
    const fakeGeom = {id: 42}
    expect(viewer.IFC.loader.ifcManager.getExpressId(fakeGeom, 0)).toBe(42)
  })

  it('treats a single-vertex _expressid (count===1) as not-per-vertex', () => {
    // count===1 looks like a leftover synthetic write — fall back to
    // the legacy path to avoid claiming picking we cannot deliver.
    const mesh = makeMesh({_expressid: new BufferAttribute(new Int32Array([7]), 1)})
    const viewer = makeViewerStub()
    const stockGetExpressId = viewer.IFC.loader.ifcManager.getExpressId

    convertToShareModel(mesh, viewer)

    expect(mesh.geometry.attributes.expressID.count).toBe(1)
    expect(viewer.IFC.loader.ifcManager.getExpressId).not.toBe(stockGetExpressId)
  })

  it('leaves obj3d.expressID undefined when per-vertex source exists', () => {
    // CadView's click handler branches on `mesh.expressID !== undefined`.
    // If we set a mesh-level serial here, the handler resolves the whole
    // mesh to one expressID for every face — back to the bug we are
    // trying to fix. The per-vertex source must be the only signal.
    const ids = new Int32Array([10, 10, 10, 20, 20, 20])
    const mesh = makeMesh({_expressid: new BufferAttribute(ids, 1)})
    convertToShareModel(mesh, makeViewerStub())
    expect(mesh.expressID).toBeUndefined()
  })

  it('sets the legacy mesh-level expressID when there is no per-vertex source', () => {
    // Other non-IFC paths (OBJ / STL / direct .glb) rely on the serial.
    const mesh = makeMesh({position: new BufferAttribute(new Float32Array(9), 3)})
    convertToShareModel(mesh, makeViewerStub())
    expect(typeof mesh.expressID).toBe('number')
  })

  it('rolls up preservation across a hierarchy: any one mesh keeps stock getExpressId', () => {
    const meshWith = makeMesh({_expressid: new BufferAttribute(new Int32Array([1, 2, 3]), 1)})
    const meshWithout = makeMesh({position: new BufferAttribute(new Float32Array(9), 3)})
    meshWith.add(meshWithout)
    const viewer = makeViewerStub()
    const stockGetExpressId = viewer.IFC.loader.ifcManager.getExpressId

    convertToShareModel(meshWith, viewer)

    expect(meshWith.geometry.attributes.expressID.count).toBe(3)
    // Child mesh got the legacy 1-byte synthetic write since it had
    // no per-vertex source itself.
    expect(meshWithout.geometry.attributes.expressID.count).toBe(1)
    // BUT — because at least one mesh in the tree had per-vertex IDs,
    // we keep the stock getExpressId. Picks on `meshWith` work
    // element-level; picks on `meshWithout` fall back to mesh-level
    // (whatever stock getExpressId yields on a 1-byte attr).
    expect(viewer.IFC.loader.ifcManager.getExpressId).toBe(stockGetExpressId)
  })
})


describe('Loader/convertToShareModel — Phase 2b.2 capability + subset wiring', () => {
  // These tests cover the full post-convertToShareModel sequence done
  // in Loader.js#load: decorateShareModel → inferModelCapabilities →
  // attachElementSubsets. The pipeline is exercised explicitly (rather
  // than via load()) because the failing screenshot trace ran through
  // exactly this sequence: setSelection branches on the capabilities
  // these three calls produce.

  it('cache-hit GLB roundtrip flips expressIdPicking on and attaches createSubset', () => {
    const idTriangleA = [10, 10, 10]
    const idTriangleB = [20, 20, 20]
    const ids = new Int32Array([...idTriangleA, ...idTriangleB])
    const geom = new BufferGeometry()
    geom.setAttribute('position', new BufferAttribute(new Float32Array(18), 3))
    geom.setAttribute('_expressid', new BufferAttribute(ids, 1))
    geom.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2, 3, 4, 5]), 1))
    const mesh = new Mesh(geom)
    const viewer = makeViewerStub()

    // Simulate the GLB-typical hierarchy: scene → mesh (or scene →
    // group → mesh). attachElementSubsets parents under
    // sourceMesh.parent for correct world-transform inheritance.
    const scene = new Scene()
    scene.add(mesh)

    // The exact sequence Loader.js#load performs:
    convertToShareModel(mesh, viewer)
    decorateShareModel(mesh, 'glb')
    Object.assign(mesh.capabilities, inferModelCapabilities(mesh))
    if (mesh.capabilities.expressIdPicking && !mesh.capabilities.ifcSubsets) {
      attachElementSubsets(mesh, scene)
    }

    expect(mesh.format).toBe('glb')
    expect(mesh.capabilities.expressIdPicking).toBe(true)
    // No web-ifc-three parser state on a cache-hit GLB.
    expect(mesh.capabilities.ifcSubsets).toBe(false)
    expect(typeof mesh.createSubset).toBe('function')
    // The selection path call-sites use this exact shape.
    const subset = mesh.createSubset({
      ids: [10],
      customID: 'selection',
      removePrevious: true,
    })
    expect(subset.length).toBe(1)
    // Subset is parented under mesh.parent (= scene here), inheriting
    // any ancestor transforms.
    expect(subset[0].parent).toBe(scene)
  })

  it('unstructured GLB upload (no per-vertex IDs) gets all-off capabilities and no createSubset', () => {
    const geom = new BufferGeometry()
    geom.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
    const mesh = new Mesh(geom)
    const viewer = makeViewerStub()

    convertToShareModel(mesh, viewer)
    decorateShareModel(mesh, 'glb')
    Object.assign(mesh.capabilities, inferModelCapabilities(mesh))
    if (mesh.capabilities.expressIdPicking && !mesh.capabilities.ifcSubsets) {
      attachElementSubsets(mesh, new Scene())
    }

    expect(mesh.capabilities.expressIdPicking).toBe(false)
    // No subset machinery — falls through to mesh-level picking only.
    expect(mesh.createSubset).toBeUndefined()
  })

  it('real-IFC path (format=ifc) keeps ifcSubsets on; no element-subset attachment runs', () => {
    // Simulates the format=ifc branch. We pass an IFC-shaped model;
    // capability defaults turn everything on; the per-vertex inspector
    // doesn't trigger attachElementSubsets (because ifcSubsets is true).
    const ids = new Int32Array([100, 100, 100])
    const geom = new BufferGeometry()
    geom.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
    geom.setAttribute('expressID', new BufferAttribute(ids, 1))
    const mesh = new Mesh(geom)

    decorateShareModel(mesh, 'ifc')
    Object.assign(mesh.capabilities, inferModelCapabilities(mesh))
    let attached = false
    if (mesh.capabilities.expressIdPicking && !mesh.capabilities.ifcSubsets) {
      attached = true
      attachElementSubsets(mesh, new Scene())
    }
    expect(mesh.capabilities.ifcSubsets).toBe(true)
    expect(attached).toBe(false)
    // No model.createSubset attached — real-IFC routes through
    // web-ifc-three's IFC.selector.pickIfcItemsByID instead.
    expect(mesh.createSubset).toBeUndefined()
  })

  it('cache-hit BLDRS_spatial_tree hydrates a model-level getSpatialStructure closure', () => {
    // Mirrors what the BldrsSpatialTreeReader plugin parks on the
    // scene root: a JSON-decoded IFC tree on userData. convertToShareModel
    // should promote it to a `model.getSpatialStructure(modelID, withProps)`
    // closure so CadView's NavTree path can read it without going through
    // the shared `viewer.IFC.loader.ifcManager` shim.
    const mesh = new Mesh(new BufferGeometry())
    mesh.userData.bldrsSpatialTree = {
      expressID: 1,
      type: 'IFCPROJECT',
      Name: {value: 'Cached Project'},
      children: [
        {expressID: 2, type: 'IFCSITE', Name: {value: 'Site'}, children: []},
      ],
    }
    convertToShareModel(mesh, makeViewerStub())
    expect(typeof mesh.getSpatialStructure).toBe('function')
    // The closure is sync-on-tree (no await internally) but signed as
    // (modelID, withProperties) so it matches the legacy
    // `ifcManager.getSpatialStructure` shape — the CadView caller awaits
    // the result regardless. Pass the same args the live path uses.
    const root = mesh.getSpatialStructure(0, true)
    expect(root.expressID).toBe(1)
    expect(root.Name.value).toBe('Cached Project')
    expect(root.children).toHaveLength(1)
  })

  it('no BLDRS_spatial_tree on userData → no closure attached (live-IFC fallback path)', () => {
    // Regression guard: an earlier iteration attached the closure
    // unconditionally, which collided with `web-ifc-three.IFCModel`'s
    // own prototype `getSpatialStructure(): Promise<any>` (no args).
    // CadView discriminates on `userData.bldrsSpatialTree`; the model
    // here must NOT carry a model-level method when the userData hook
    // is absent.
    const mesh = new Mesh(new BufferGeometry())
    // userData.bldrsSpatialTree intentionally unset.
    convertToShareModel(mesh, makeViewerStub())
    expect(mesh.getSpatialStructure).toBeUndefined()
  })

  it('cache-hit BLDRS_element_properties hydrates getItemProperties and getPropertySets', () => {
    // Mirrors what `BldrsElementPropertiesReader#afterRoot` parks: a
    // `{compressed, getRecord, getPsetIds}` lazy per-entity payload.
    // The hydration block in convertToShareModel attaches closures
    // that delegate lookups to the payload's accessors (which decode
    // the header index + record blocks lazily — see
    // makeElementPropertiesPayload).
    const records = {
      100: {expressID: 100, Name: {type: 1, value: 'Wall A'}},
      500: {expressID: 500, Name: {type: 1, value: 'Pset_WallCommon'}, HasProperties: []},
    }
    const psetIndex = {100: [500]}
    const mesh = new Mesh(new BufferGeometry())
    let accessorCalls = 0
    mesh.userData.bldrsElementProperties = {
      compressed: new Uint8Array([0]),
      getRecord(id) {
        accessorCalls++
        return records[id]
      },
      getPsetIds(id) {
        accessorCalls++
        return psetIndex[id] ?? []
      },
    }
    convertToShareModel(mesh, makeViewerStub())

    expect(typeof mesh.getItemProperties).toBe('function')
    expect(typeof mesh.getPropertySets).toBe('function')
    // No decode happens at hydration time — closures defer the work.
    expect(accessorCalls).toBe(0)

    const wall = mesh.getItemProperties(100)
    expect(wall.Name.value).toBe('Wall A')
    const pset = mesh.getItemProperties(500)
    expect(pset.Name.value).toBe('Pset_WallCommon')

    // getPropertySets returns the array of pset objects (not IDs) —
    // matching the Properties.jsx consumer contract.
    const psets = mesh.getPropertySets(100)
    expect(psets).toHaveLength(1)
    expect(psets[0]).toEqual(records[500])
    expect(accessorCalls).toBeGreaterThan(0)
  })

  it('cache-hit Properties: getPropertySets returns [] for a product with no psets', () => {
    // Real payload over real container bytes — pins the
    // encode → lazy-read integration on the consumer surface.
    const mesh = new Mesh(new BufferGeometry())
    mesh.userData.bldrsElementProperties = makeElementPropertiesPayload(
      encodeElementProperties({100: {expressID: 100}}, {}))
    convertToShareModel(mesh, makeViewerStub())
    expect(mesh.getPropertySets(100)).toEqual([])
    // Also for an expressID that isn't in the index at all.
    expect(mesh.getPropertySets(9999)).toEqual([])
  })

  it('cache-hit Properties: getItemProperties returns undefined for missing IDs', () => {
    // Real-world: consumer's `deref` calls `getItemProperties(refId)`
    // for arbitrary refIds it encounters. If a ref isn't in the cached
    // closure (BFS missed it; or the cache is stale), returning
    // undefined lets the consumer's null-guard kick in. Critical: no
    // throw on lookup miss.
    const mesh = new Mesh(new BufferGeometry())
    mesh.userData.bldrsElementProperties = makeElementPropertiesPayload(
      encodeElementProperties({1: {x: 1}}, {}))
    convertToShareModel(mesh, makeViewerStub())
    expect(mesh.getItemProperties(1)).toEqual({x: 1})
    expect(mesh.getItemProperties(9999)).toBeUndefined()
  })

  it('no BLDRS_element_properties on userData → no closures attached', () => {
    // Symmetric to the spatial-tree regression guard above. Live IFC
    // parses don't ship the payload — the model must NOT carry the
    // model-level methods so consumers fall through to whatever the
    // live ifcManager exposes.
    const mesh = new Mesh(new BufferGeometry())
    // userData.bldrsElementProperties intentionally unset.
    convertToShareModel(mesh, makeViewerStub())
    expect(mesh.getItemProperties).toBeUndefined()
    expect(mesh.getPropertySets).toBeUndefined()
  })
})


describe('Loader/convertToShareModel — cache-hit page title hydration', () => {
  // Regression: before the title stamp landed, every cache-hit page
  // title degraded to "${mimeType} model" ("glb model") because the
  // GLB carried no project name. The writer now stamps the live
  // model.name (Conway's statsApi.projectName, e.g. "Momentum") into
  // `scenes[0].extras.bldrsTitle`; three.js GLTFLoader auto-promotes
  // it to `model.userData.bldrsTitle`, and `convertToShareModel`
  // hydrates `model.{Name,LongName,name}` from it BEFORE the
  // `${mimeType} model` fallback would clobber them.

  it('hydrates Name, LongName, and name from userData.bldrsTitle on cache-hit', () => {
    const mesh = new Mesh(new BufferGeometry())
    mesh.userData.bldrsTitle = 'Momentum'
    mesh.mimeType = 'glb'
    convertToShareModel(mesh, makeViewerStub())
    expect(mesh.name).toBe('Momentum')
    expect(mesh.Name.value).toBe('Momentum')
    expect(mesh.LongName.value).toBe('Momentum')
  })

  it('falls back to "${mimeType} model" when userData.bldrsTitle is absent', () => {
    // Drag-dropped GLB / pre-title-stamp cached artifact: no title in
    // userData → existing placeholder path runs unchanged.
    const mesh = new Mesh(new BufferGeometry())
    mesh.mimeType = 'glb'
    convertToShareModel(mesh, makeViewerStub())
    expect(mesh.name).toBe('glb model')
  })

  it('ignores a non-string bldrsTitle (defensive against malformed cache extras)', () => {
    // Untrusted-input guard: if a future writer or a hostile cache
    // file puts a non-string at `userData.bldrsTitle`, we must not
    // splice it into the page <title>. Fall through to the placeholder.
    const mesh = new Mesh(new BufferGeometry())
    mesh.userData.bldrsTitle = {value: 'wrong shape'}
    mesh.mimeType = 'glb'
    convertToShareModel(mesh, makeViewerStub())
    expect(mesh.name).toBe('glb model')
  })

  it('ignores an empty-string bldrsTitle (same fall-through as absent)', () => {
    const mesh = new Mesh(new BufferGeometry())
    mesh.userData.bldrsTitle = ''
    mesh.mimeType = 'glb'
    convertToShareModel(mesh, makeViewerStub())
    expect(mesh.name).toBe('glb model')
  })

  it('does not overwrite a pre-existing model.name (live-IFC path is untouched)', () => {
    // Live IFC parse already sets model.name via statsApi.projectName.
    // The hydration block must NOT clobber that — if it did, the live
    // parse and cache-hit paths would diverge whenever the IFC root's
    // Name differed from statsApi.projectName.
    const mesh = new Mesh(new BufferGeometry())
    mesh.name = 'From IFC parse'
    mesh.userData.bldrsTitle = 'Stale Cache Title'
    mesh.mimeType = 'glb'
    convertToShareModel(mesh, makeViewerStub())
    expect(mesh.name).toBe('From IFC parse')
  })

  it('leaves Name and LongName consistent with model.name when a pre-set name takes precedence', () => {
    // Reviewer-flagged inconsistency: if model.name is pre-set AND
    // userData.bldrsTitle is set, model.name keeps its pre-existing
    // value and the stale cached title is ignored entirely. Since the
    // standard-naming change (#1595), Name/LongName mirror the winning
    // model.name — one source of truth for all three fields — instead
    // of degrading to the `${mimeType} model` placeholder.
    const mesh = new Mesh(new BufferGeometry())
    mesh.name = 'From IFC parse'
    mesh.userData.bldrsTitle = 'Stale Cache Title'
    mesh.mimeType = 'glb'
    convertToShareModel(mesh, makeViewerStub())
    expect(mesh.name).toBe('From IFC parse')
    expect(mesh.Name.value).toBe('From IFC parse')
    expect(mesh.LongName.value).toBe('From IFC parse')
  })
})


describe('Loader/convertToShareModel — standard scenegraph node naming (#1595)', () => {
  // three.js loaders carry the source file's node names on
  // `Object3D.name` (GLTFLoader copies glTF `nodes[i].name` — e.g.
  // NASA's ISS_stationary.glb names every node; OBJLoader uses o/g
  // group names). The decoration step must surface those through the
  // IFC-shaped `Name`/`LongName` that reifyName (NavTree) and the
  // Properties panel read, instead of stamping the 'Object'
  // placeholder over them.

  it('fills Name/LongName from Object3D.name on child nodes', () => {
    const root = new Mesh(new BufferGeometry())
    const child = new Mesh(new BufferGeometry())
    child.name = 'S0_Truss'
    root.add(child)
    convertToShareModel(root, makeViewerStub())
    expect(child.Name.value).toBe('S0_Truss')
    expect(child.LongName.value).toBe('S0_Truss')
  })

  it('keeps the legacy Object placeholder for unnamed child nodes', () => {
    const root = new Mesh(new BufferGeometry())
    const child = new Mesh(new BufferGeometry()) // Object3D.name defaults to ''
    root.add(child)
    convertToShareModel(root, makeViewerStub())
    expect(child.Name.value).toBe('Object')
    expect(child.LongName.value).toBe('Object')
  })

  it('does not clobber a pre-existing IFC-shaped Name on a child', () => {
    const root = new Mesh(new BufferGeometry())
    const child = new Mesh(new BufferGeometry())
    child.name = 'raw scenegraph name'
    child.Name = {value: 'IFC-provided name'}
    root.add(child)
    convertToShareModel(root, makeViewerStub())
    expect(child.Name.value).toBe('IFC-provided name')
  })

  it('sanitizes child node names (untrusted-file boundary)', () => {
    const root = new Mesh(new BufferGeometry())
    const child = new Mesh(new BufferGeometry())
    child.name = '<b>Node ‮</b>'
    root.add(child)
    convertToShareModel(root, makeViewerStub())
    expect(child.Name.value).toBe('bNode/b')
  })

  it('a child name that sanitizes to nothing falls back to the Object placeholder', () => {
    const root = new Mesh(new BufferGeometry())
    const child = new Mesh(new BufferGeometry())
    child.name = ' ‮<>'
    root.add(child)
    convertToShareModel(root, makeViewerStub())
    expect(child.Name.value).toBe('Object')
  })

  it('names nested descendants from their own Object3D.name', () => {
    const root = new Mesh(new BufferGeometry())
    const mid = new Mesh(new BufferGeometry())
    mid.name = 'ISS_stationary'
    const leaf = new Mesh(new BufferGeometry())
    leaf.name = '23_港_2020_Model'
    root.add(mid)
    mid.add(leaf)
    convertToShareModel(root, makeViewerStub())
    expect(mid.Name.value).toBe('ISS_stationary')
    expect(leaf.Name.value).toBe('23_港_2020_Model')
  })

  it('uses the glTF scene name for the root Name/LongName (plain GLB)', () => {
    // GLTFLoader sets the returned scene Group's `name` from the glTF
    // `scenes[n].name`. For a plain (non-Bldrs) GLB that IS the model
    // root, so the NavTree root label / page title use the authored
    // scene name instead of the "glb model" placeholder.
    const mesh = new Mesh(new BufferGeometry())
    mesh.name = 'ISS_stationary'
    mesh.mimeType = 'glb'
    convertToShareModel(mesh, makeViewerStub())
    expect(mesh.name).toBe('ISS_stationary')
    expect(mesh.Name.value).toBe('ISS_stationary')
    expect(mesh.LongName.value).toBe('ISS_stationary')
  })

  it('sanitizes a file-derived root name before it reaches Name / page title', () => {
    const mesh = new Mesh(new BufferGeometry())
    mesh.name = 'Scene‮<script>'
    mesh.mimeType = 'glb'
    convertToShareModel(mesh, makeViewerStub())
    expect(mesh.name).toBe('Scenescript')
    expect(mesh.Name.value).toBe('Scenescript')
  })

  it('a root name that sanitizes to nothing re-enables cached-title promotion', () => {
    const mesh = new Mesh(new BufferGeometry())
    mesh.name = ' ‮'
    mesh.userData.bldrsTitle = 'Momentum'
    mesh.mimeType = 'glb'
    convertToShareModel(mesh, makeViewerStub())
    expect(mesh.name).toBe('Momentum')
    expect(mesh.Name.value).toBe('Momentum')
  })
})


describe('Loader/sanitizeCachedTitle — untrusted-input scrubbing', () => {
  // The cached title is an untrusted-input boundary in the
  // originator-share design (see design/new/glb-model-sharing.md
  // §"Validation and trust"). Defense-in-depth: even though React
  // Helmet escapes the text it places in `<title>`, we strip the
  // characters most likely to break non-escaping consumers and
  // spoofing-prone bidi overrides at the read boundary.

  it('returns null for non-string input', () => {
    expect(__sanitizeCachedTitleForTest(undefined)).toBeNull()
    expect(__sanitizeCachedTitleForTest(null)).toBeNull()
    expect(__sanitizeCachedTitleForTest(42)).toBeNull()
    expect(__sanitizeCachedTitleForTest({})).toBeNull()
    expect(__sanitizeCachedTitleForTest([])).toBeNull()
  })

  it('returns null for the empty string', () => {
    expect(__sanitizeCachedTitleForTest('')).toBeNull()
  })

  it('passes a clean ASCII title through unchanged', () => {
    expect(__sanitizeCachedTitleForTest('Momentum')).toBe('Momentum')
    expect(__sanitizeCachedTitleForTest('Bldrs Plaza 2024')).toBe('Bldrs Plaza 2024')
  })

  it('passes clean Unicode through unchanged', () => {
    // Real IFC project names from non-English locales must round-trip.
    expect(__sanitizeCachedTitleForTest('Seestrasse 12')).toBe('Seestrasse 12')
    expect(__sanitizeCachedTitleForTest('Bürohaus München')).toBe('Bürohaus München')
    expect(__sanitizeCachedTitleForTest('東京タワー')).toBe('東京タワー')
  })

  it('strips ASCII control characters (NUL, newlines, tabs, U+007F)', () => {
    expect(__sanitizeCachedTitleForTest('Bldrs\u0000Plaza')).toBe('BldrsPlaza')
    expect(__sanitizeCachedTitleForTest('Line1\nLine2')).toBe('Line1Line2')
    expect(__sanitizeCachedTitleForTest('Col1\tCol2')).toBe('Col1Col2')
    expect(__sanitizeCachedTitleForTest('Title\u007F')).toBe('Title')
  })

  it('strips bidi-override characters (U+202A-U+202E, U+2066-U+2069)', () => {
    // RLO (U+202E) is the classic "evil.txt" → "txt.lave" spoof trick.
    expect(__sanitizeCachedTitleForTest('Project‮Reversed')).toBe('ProjectReversed')
    expect(__sanitizeCachedTitleForTest('‪StartLRE')).toBe('StartLRE')
    expect(__sanitizeCachedTitleForTest('⁦isolate⁩')).toBe('isolate')
  })

  it('strips `<` and `>` as defense-in-depth against unescaped renderers', () => {
    expect(__sanitizeCachedTitleForTest('<script>alert(1)</script>')).toBe('scriptalert(1)/script')
    expect(__sanitizeCachedTitleForTest('a<b>c')).toBe('abc')
  })

  it('caps very long titles at 200 characters', () => {
    const longTitle = 'A'.repeat(300)
    const result = __sanitizeCachedTitleForTest(longTitle)
    expect(result).toHaveLength(200)
    expect(result).toBe('A'.repeat(200))
  })

  it('returns null when stripping reduces the title to empty', () => {
    // A title made entirely of stripped characters has no signal to
    // keep — same outcome as not having a title at all.
    expect(__sanitizeCachedTitleForTest('\u0000\u0001\u202E<>')).toBeNull()
  })

  it('cache-hit hydration integrates the sanitizer', () => {
    // End-to-end through convertToShareModel: a title with control
    // characters + tags + bidi overrides should land as plain text.
    const mesh = new Mesh(new BufferGeometry())
    mesh.userData.bldrsTitle = '<b>Bld\u0000rs\u202E Plaza</b>'
    mesh.mimeType = 'glb'
    convertToShareModel(mesh, makeViewerStub())
    expect(mesh.name).toBe('bBldrs Plaza/b')
  })

  it('a title that becomes empty after sanitization falls through to the placeholder', () => {
    const mesh = new Mesh(new BufferGeometry())
    mesh.userData.bldrsTitle = '\u202E\u0000<>'
    mesh.mimeType = 'glb'
    convertToShareModel(mesh, makeViewerStub())
    expect(mesh.name).toBe('glb model')
  })
})


describe('Loader/convertToShareModel — root label filename composition (#1595)', () => {
  // Authored scene names are often generic exporter defaults
  // (Blender's "Scene"), so the root label composes the source
  // filename in parens — "Scene (ISS_stationary.glb)" — matching the
  // three.js editor's use of the import filename. The filename comes
  // from Loader#load: recent-files entry for uploads, trailing path
  // part for URLs.

  it('composes "<sceneName> (<fileName>)" when both exist', () => {
    const mesh = new Mesh(new BufferGeometry())
    mesh.name = 'Scene'
    mesh.mimeType = 'glb'
    convertToShareModel(mesh, makeViewerStub(), {fileName: 'ISS_stationary.glb'})
    expect(mesh.name).toBe('Scene (ISS_stationary.glb)')
    expect(mesh.Name.value).toBe('Scene (ISS_stationary.glb)')
    expect(mesh.LongName.value).toBe('Scene (ISS_stationary.glb)')
  })

  it('uses the filename alone when the file has no scene name', () => {
    const mesh = new Mesh(new BufferGeometry())
    mesh.mimeType = 'glb'
    convertToShareModel(mesh, makeViewerStub(), {fileName: 'ISS_stationary.glb'})
    expect(mesh.name).toBe('ISS_stationary.glb')
    expect(mesh.Name.value).toBe('ISS_stationary.glb')
  })

  it('does not duplicate when the scene name equals the filename', () => {
    const mesh = new Mesh(new BufferGeometry())
    mesh.name = 'cube.glb'
    mesh.mimeType = 'glb'
    convertToShareModel(mesh, makeViewerStub(), {fileName: 'cube.glb'})
    expect(mesh.name).toBe('cube.glb')
  })

  it('keeps behavior unchanged when no fileName is provided', () => {
    const mesh = new Mesh(new BufferGeometry())
    mesh.name = 'Scene'
    mesh.mimeType = 'glb'
    convertToShareModel(mesh, makeViewerStub())
    expect(mesh.name).toBe('Scene')
  })

  it('does not append the filename to a cache-stamped IFC project title', () => {
    // Cache-hit GLB of an IFC: the bldrsTitle is the real project name
    // ("Momentum"); appending the source filename would diverge from
    // the live-parse page title.
    const mesh = new Mesh(new BufferGeometry())
    mesh.userData.bldrsTitle = 'Momentum'
    mesh.mimeType = 'glb'
    convertToShareModel(mesh, makeViewerStub(), {fileName: 'index.ifc'})
    expect(mesh.name).toBe('Momentum')
    expect(mesh.Name.value).toBe('Momentum')
  })

  it('does not append when the scene name IS the stamped cache title (0.10.0 writer)', () => {
    // New-writer artifacts stamp the title into BOTH scenes[0].name and
    // extras.bldrsTitle; GLTFLoader hands the scene name back on
    // model.name. Equality with the cached title marks it as an IFC
    // project name, not an authored scenegraph name.
    const mesh = new Mesh(new BufferGeometry())
    mesh.name = 'Momentum'
    mesh.userData.bldrsTitle = 'Momentum'
    mesh.mimeType = 'glb'
    convertToShareModel(mesh, makeViewerStub(), {fileName: 'index.ifc'})
    expect(mesh.name).toBe('Momentum')
  })

  it('sanitizes the filename before composing', () => {
    const mesh = new Mesh(new BufferGeometry())
    mesh.name = 'Scene'
    mesh.mimeType = 'glb'
    convertToShareModel(mesh, makeViewerStub(), {fileName: '<evil>‮name.glb'})
    expect(mesh.name).toBe('Scene (evilname.glb)')
  })

  it('a filename that sanitizes to nothing leaves the scene name alone', () => {
    const mesh = new Mesh(new BufferGeometry())
    mesh.name = 'Scene'
    mesh.mimeType = 'glb'
    convertToShareModel(mesh, makeViewerStub(), {fileName: ' ‮<>'})
    expect(mesh.name).toBe('Scene')
  })
})
