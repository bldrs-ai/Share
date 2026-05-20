// installConwayDirectGeometry mutates a freshly-parsed wit-three
// `IFCModel` in place — swaps geometry + material to Conway-direct
// outputs, attaches `IfcInstanceMap`, flips capabilities. Test
// against a minimal ifcModel stand-in and a mocked Conway IfcAPI
// matching the small surface the assembler uses.

import {BufferAttribute, BufferGeometry, Mesh, MeshLambertMaterial} from 'three'
import {installConwayDirectGeometry} from './Loader'


/** Identity 4×4 in three.js column-major flat form. */
const IDENTITY_MAT = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]


/** @return {Float32Array} single-triangle interleaved vert buffer (p+n). */
function unitTriangleVerts() {
  return new Float32Array([
    0, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 1,
    0, 1, 0, 0, 0, 1,
  ])
}


/**
 * @param {object} byGeomExpressId map of geomExpressID → {vertexData, indexData}
 * @return {object} mock Conway IfcAPI surfacing GetGeometry / GetVertexArray /
 *   GetIndexArray, with the same lastVerts/lastIndices stash trick the
 *   buildConwayIfcModel tests use.
 */
function makeApi(byGeomExpressId) {
  const api = {
    _lastVerts: null,
    _lastIndices: null,
    GetGeometry(_modelID, geomExpressID) {
      const g = byGeomExpressId[geomExpressID]
      if (!g) {
        return null
      }
      api._lastVerts = g.vertexData
      api._lastIndices = g.indexData
      return {
        GetVertexData: () => 0,
        GetIndexData: () => 0,
        GetVertexDataSize: () => g.vertexData.length,
        GetIndexDataSize: () => g.indexData.length,
      }
    },
    GetVertexArray() {
      return api._lastVerts
    },
    GetIndexArray() {
      return api._lastIndices
    },
  }
  return api
}


/**
 * Build a minimal `ifcModel` matching what `web-ifc-three` produces
 * pre-swap: a Mesh with a placeholder geometry + material array +
 * decorated capabilities. The Conway swap will replace `geometry` and
 * `material` and mutate `capabilities`.
 *
 * @param {number} [modelID]
 * @return {object} ifcModel stand-in
 */
function makeIfcModel(modelID = 0) {
  const placeholderGeom = new BufferGeometry()
  // Some content so dispose has work to do — we'll assert it was called.
  placeholderGeom.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
  placeholderGeom.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
  const placeholderMaterials = [new MeshLambertMaterial()]
  const mesh = new Mesh(placeholderGeom, placeholderMaterials)
  mesh.modelID = modelID
  // Match `decorateShareModel` output for an IFC.
  mesh.capabilities = {
    expressIdPicking: true,
    spatialStructure: true,
    typedProperties: true,
    ifcSubsets: true,
    instancePicking: false,
    useIfcClipper: true,
  }
  return mesh
}


/**
 * @param {Array} entries each `{expressID, placed: [{geometryExpressID, color?}, ...]}`
 * @return {Array} FlatMesh-shaped vector source
 */
function makeFlatMeshes(entries) {
  return entries.map((e) => ({
    expressID: e.expressID,
    geometries: {
      size: () => e.placed.length,
      get: (i) => ({
        geometryExpressID: e.placed[i].geometryExpressID,
        flatTransformation: IDENTITY_MAT,
        color: e.placed[i].color,
      }),
    },
  }))
}


describe('loader/installConwayDirectGeometry', () => {
  it('swaps geometry to the Conway-direct assembled buffer', () => {
    const api = makeApi({
      999: {
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
      },
    })
    const ifcModel = makeIfcModel()
    const placeholderGeom = ifcModel.geometry
    const flatMeshes = makeFlatMeshes([
      {expressID: 100, placed: [{geometryExpressID: 999}]},
    ])
    installConwayDirectGeometry(api, ifcModel, flatMeshes)
    expect(ifcModel.geometry).not.toBe(placeholderGeom)
    expect(ifcModel.geometry.getAttribute('position').count).toBe(3)
    expect(ifcModel.geometry.getAttribute('expressID').count).toBe(3)
    expect(ifcModel.geometry.getAttribute('instanceID').count).toBe(3)
    expect(ifcModel.geometry.getIndex().count).toBe(3)
  })

  it('disposes the placeholder geometry to free GPU resources', () => {
    const api = makeApi({
      999: {
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
      },
    })
    const ifcModel = makeIfcModel()
    const placeholderGeom = ifcModel.geometry
    const disposeSpy = jest.spyOn(placeholderGeom, 'dispose')
    installConwayDirectGeometry(api, ifcModel, makeFlatMeshes([
      {expressID: 100, placed: [{geometryExpressID: 999}]},
    ]))
    expect(disposeSpy).toHaveBeenCalled()
  })

  it('replaces ifcModel.material with the assembler\'s material array', () => {
    const api = makeApi({
      999: {
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
      },
    })
    const ifcModel = makeIfcModel()
    const placeholderMaterial = ifcModel.material
    // Two colour bins → expect two materials.
    const RED = {x: 1, y: 0, z: 0, w: 1}
    const BLUE = {x: 0, y: 0, z: 1, w: 1}
    const flatMeshes = makeFlatMeshes([
      {expressID: 100, placed: [{geometryExpressID: 999, color: RED}]},
      {expressID: 200, placed: [{geometryExpressID: 999, color: BLUE}]},
    ])
    installConwayDirectGeometry(api, ifcModel, flatMeshes)
    expect(ifcModel.material).not.toBe(placeholderMaterial)
    expect(Array.isArray(ifcModel.material)).toBe(true)
    expect(ifcModel.material.length).toBe(2)
  })

  it('attaches an IfcInstanceMap mirroring the assembled geometry', () => {
    const api = makeApi({
      999: {
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
      },
    })
    const ifcModel = makeIfcModel()
    const flatMeshes = makeFlatMeshes([
      {expressID: 100, placed: [
        {geometryExpressID: 999},
        {geometryExpressID: 999},
      ]},
      {expressID: 200, placed: [{geometryExpressID: 999}]},
    ])
    installConwayDirectGeometry(api, ifcModel, flatMeshes)
    expect(ifcModel.instanceMap).toBeDefined()
    expect(ifcModel.instanceMap.instanceCount).toBe(3)
    expect(ifcModel.instanceMap.parentCount).toBe(2)
    expect(ifcModel.instanceMap.sourceGeometry).toBe(ifcModel.geometry)
  })

  it('flips capabilities — ifcSubsets→false, instancePicking→true, expressIdPicking→true', () => {
    const api = makeApi({
      999: {
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
      },
    })
    const ifcModel = makeIfcModel()
    expect(ifcModel.capabilities.ifcSubsets).toBe(true)
    expect(ifcModel.capabilities.instancePicking).toBe(false)
    installConwayDirectGeometry(api, ifcModel, makeFlatMeshes([
      {expressID: 100, placed: [{geometryExpressID: 999}]},
    ]))
    expect(ifcModel.capabilities.ifcSubsets).toBe(false)
    expect(ifcModel.capabilities.instancePicking).toBe(true)
    expect(ifcModel.capabilities.expressIdPicking).toBe(true)
  })

  it('replaces createSubset with the instance-map-aware variant (returns Mesh[])', () => {
    // Pre-swap: wit-three's stock `createSubset` reads against the
    // ORIGINAL geometry through `ItemsMap`. After we swap geometry,
    // wit-three's createSubset would build subsets against a stale
    // vertex buffer — the regression that broke isolate/hide on
    // conwayDirectIfc. After the install, `createSubset` is bound to
    // `attachInstanceMapSubsets`, which sources subsets from the
    // post-swap geometry through the IfcInstanceMap.
    const api = makeApi({
      999: {
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
      },
    })
    const ifcModel = makeIfcModel()
    installConwayDirectGeometry(api, ifcModel, makeFlatMeshes([
      {expressID: 100, placed: [{geometryExpressID: 999}]},
      {expressID: 200, placed: [{geometryExpressID: 999}]},
    ]))
    expect(typeof ifcModel.createSubset).toBe('function')
    expect(typeof ifcModel.removeSubset).toBe('function')
    const result = ifcModel.createSubset({
      // eslint-disable-next-line no-magic-numbers
      ids: [100],
      customID: 'Bldrs::Share::Isolator',
    })
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(1)
    // The subset is built from the new (post-swap) geometry's
    // attributes — vertex count matches the assembled buffer, not
    // wit-three's pre-swap placeholder.
    expect(result[0].geometry.getAttribute('position')).toBe(
      ifcModel.geometry.getAttribute('position'))
  })

  it('computes bounding box + sphere on the new geometry', () => {
    const api = makeApi({
      999: {
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
      },
    })
    const ifcModel = makeIfcModel()
    installConwayDirectGeometry(api, ifcModel, makeFlatMeshes([
      {expressID: 100, placed: [{geometryExpressID: 999}]},
    ]))
    expect(ifcModel.geometry.boundingBox).not.toBeNull()
    expect(ifcModel.geometry.boundingSphere).not.toBeNull()
  })

  it('rebuilds the IfcInstanceMap AFTER computeBoundsTree (BVH-reorder-safe)', () => {
    // The motivating regression: three-mesh-bvh reorders the geometry's
    // index buffer in place. The emission-order map from
    // buildConwayIfcModel was wrong after reorder; we now discard it
    // and rebuild via `instanceMapFromGeometry` AFTER `computeBoundsTree()`.
    // Simulate a BVH that reverses the index buffer; the rebuilt map's
    // `triangleIndexToInstanceId[0]` should reflect the *new* first
    // triangle's per-vertex instance ID.
    const api = makeApi({
      999: {
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
      },
    })
    const ifcModel = makeIfcModel()
    // Inject a fake `computeBoundsTree` onto BufferGeometry.prototype
    // for the duration of the test — three-mesh-bvh patches the
    // prototype globally in production; we simulate that monkey-patch.
    const origCompute = BufferGeometry.prototype.computeBoundsTree
    BufferGeometry.prototype.computeBoundsTree = function() {
      // Reverse the index buffer in place (simulating BVH reorder
      // permuting triangles). Vertex attributes stay put.
      const idx = this.getIndex().array
      const triCount = (idx.length / 3) | 0
      for (let a = 0, b = triCount - 1; a < b; a++, b--) {
        for (let k = 0; k < 3; k++) {
          const tmp = idx[(a * 3) + k]
          idx[(a * 3) + k] = idx[(b * 3) + k]
          idx[(b * 3) + k] = tmp
        }
      }
    }
    try {
      // Two PlacedGeometries → two triangles → two instances.
      // Pre-BVH: tri 0 = instance 0, tri 1 = instance 1.
      // Post-BVH (reversed): tri 0 = instance 1, tri 1 = instance 0.
      installConwayDirectGeometry(api, ifcModel, makeFlatMeshes([
        {expressID: 100, placed: [
          {geometryExpressID: 999},
          {geometryExpressID: 999},
        ]},
      ]))
      const map = ifcModel.instanceMap
      // Triangle 0 (post-reorder) should resolve to the instance
      // whose vertices the index buffer NOW points at.
      expect(Array.from(map.triangleIndexToInstanceId)).toEqual([1, 0])
    } finally {
      BufferGeometry.prototype.computeBoundsTree = origCompute
    }
  })

  it('safely no-ops on an empty FlatMesh capture (defensive guard)', () => {
    const ifcModel = makeIfcModel()
    const placeholderGeom = ifcModel.geometry
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    installConwayDirectGeometry({}, ifcModel, [])
    // Geometry unchanged, no swap happened, no crash.
    expect(ifcModel.geometry).toBe(placeholderGeom)
    expect(ifcModel.instanceMap).toBeUndefined()
    expect(ifcModel.capabilities.ifcSubsets).toBe(true)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/no FlatMesh capture/))
    warnSpy.mockRestore()
  })

  it('emits a stats log line with vertex / triangle counts and Conway-vs-wit comparison', () => {
    const api = makeApi({
      999: {
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
      },
    })
    const ifcModel = makeIfcModel()
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    installConwayDirectGeometry(api, ifcModel, makeFlatMeshes([
      {expressID: 100, placed: [{geometryExpressID: 999}]},
    ]))
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[conwayDirect\] installed modelID=0.*vertices=3.*triangles=1.*instances=1.*parents=1/),
    )
    warnSpy.mockRestore()
  })
})
