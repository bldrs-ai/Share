/* eslint-disable no-magic-numbers */
// Focused tests for Loader.js#convertToShareModel — specifically the
// Phase 2b picking-fix: detection of a GLB-cache-roundtripped per-vertex
// `_expressid` attribute and preservation as `expressID` so web-ifc-three's
// stock `IFCLoader#getExpressId` works without modification. Older
// (mesh-level / no per-vertex IDs) paths must continue to behave as before.

import {BufferAttribute, BufferGeometry, Mesh, Scene} from 'three'
import {convertToShareModel} from './Loader'
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
})
