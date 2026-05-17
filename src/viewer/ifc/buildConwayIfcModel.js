import {Mesh, MeshLambertMaterial} from 'three'
import {flatMeshToBufferGeometry} from './flatMeshToBufferGeometry'
import {instanceMapFromOrderedPlacedRanges} from './IfcInstanceMap'


/**
 * buildConwayIfcModel — turn a captured Conway FlatMesh stream into
 * a renderable `Mesh` + matching `IfcInstanceMap`.
 *
 * The Conway-direct counterpart to `web-ifc-three.IFCParser#loadAllGeometry`
 * (IFCLoader.js:162-184) — but assembled from FlatMeshes we already
 * captured during a previous parse, so this is a side-channel build
 * with no extra Conway walk.
 *
 * Two outputs from one walk:
 *   - `mesh` — single merged Mesh, per-vertex `expressID` (parent
 *     IFC product) + per-vertex `instanceID` (synthetic, per
 *     PlacedGeometry).
 *   - `instanceMap` — IfcInstanceMap built from the same emission
 *     order, with `sourceGeometry` pointing at `mesh.geometry` so
 *     subsets work immediately.
 *
 * Material: a single default `MeshLambertMaterial`. Today this
 * matches the visual baseline (web-ifc-three's per-color bins still
 * render through MeshLambertMaterial under the hood). Per-material
 * grouping by Conway's `PlacedGeometry.color` is a follow-up — for
 * the test-phase scaffold one material per model is enough to
 * validate the assembly pipeline.
 *
 * Caller's responsibility — adding the mesh to the scene, BVH
 * acceleration, coordinate-system setup, selection wiring. This
 * module owns only the parse → renderable conversion.
 *
 * @param {Array} capturedFlatMeshes FlatMeshes captured during the
 *   live web-ifc-three parse via the `ifcItemsMapParity` capture
 *   wrapper (or anything that produces the same shape)
 * @param {object} api Conway-compatible IfcAPI
 * @param {number} modelID
 * @param {object} [opts]
 * @param {object} [opts.material] override the default material
 * @return {object} `{mesh, instanceMap, stats}` — see source for
 *   shape; stats includes vertexCount, triangleCount, instanceCount,
 *   parentCount, skippedFlatMeshes, skippedPlacedGeometries.
 */
export function buildConwayIfcModel(capturedFlatMeshes, api, modelID, opts = {}) {
  const assembled = flatMeshToBufferGeometry(capturedFlatMeshes, api, modelID)
  const instanceMap = instanceMapFromOrderedPlacedRanges(
    assembled.ranges, {geometry: assembled.geometry})
  const material = opts.material ?? new MeshLambertMaterial({color: 0xcccccc})
  const mesh = new Mesh(assembled.geometry, material)
  mesh.modelID = modelID
  // Two attached references so call-sites that pick can resolve
  // back to IFC identity without going through the items map every
  // time. Mirrors the convention `web-ifc-three.IFCModel` uses
  // (model.ifcManager) — the wiring around it is the caller's
  // concern.
  mesh.instanceMap = instanceMap
  const stats = {
    vertexCount: assembled.geometry.getAttribute('position').count,
    triangleCount: instanceMap.triangleCount,
    instanceCount: instanceMap.instanceCount,
    parentCount: instanceMap.parentCount,
    skippedFlatMeshes: assembled.skippedFlatMeshes,
    skippedPlacedGeometries: assembled.skippedPlacedGeometries,
  }
  return {mesh, instanceMap, stats}
}
