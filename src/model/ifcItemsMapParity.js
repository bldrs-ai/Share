// Diagnostic-only parity check between two `IfcItemsMap`
// populators — the per-vertex-attribute one (cache-hit / wit-three
// shape) and the Conway-direct FlatMesh stream one. Logs a one-line
// summary plus a multi-placed-FlatMesh breakdown so we can see the
// IfcMappedItem mix per model.
//
// Toggled at runtime via `?feature=ifcItemsMapParity`. Pure
// observation — both maps are dropped on the floor; the caller's
// load path is unaffected by anything we log here.
//
// See design/new/viewer-replacement.md §3b.ii for the per-vertex-vs-
// per-instance story this check exposes (Snowdon Revit's 4051/6023
// multi-placed FlatMeshes, etc.).
//
// Lifted from `src/loader/Loader.js#runIfcItemsMapParityCheck` in
// slice 5d.1 — the function moved here together with the IFC parse
// flow it diagnoses (`ShareIfcLoader.parse`).

import {
  compareItemsMaps,
  formatComparison,
  itemsMapFromFlatMeshes,
  itemsMapFromPerVertexAttribute,
} from './IfcItemsMap'


/**
 * Build the IfcItemsMap two ways (per-vertex attribute and captured
 * FlatMesh stream) for a freshly-parsed IFC model, then log a one-
 * line comparison. Diagnostic only — pure observation; the caller
 * drops both maps on the floor.
 *
 * @param {object} ifcAPI Conway-compatible IfcAPI
 * @param {object} ifcModel freshly-parsed Conway-direct Mesh
 * @param {Array} capturedFlatMeshes FlatMeshes captured during the
 *   live parse via `installFlatMeshCapture`
 */
export function runIfcItemsMapParityCheck(ifcAPI, ifcModel, capturedFlatMeshes) {
  try {
    const modelID = ifcModel.modelID
    const geom = ifcModel.geometry
    const perVertex = itemsMapFromPerVertexAttribute(geom)
    if (!perVertex) {
      console.warn(
        '[ifcItemsMapParity] per-vertex populator returned null ' +
        '(no expressID attribute or no index) — skipping parity check')
      return
    }
    if (!Array.isArray(capturedFlatMeshes) || capturedFlatMeshes.length === 0) {
      console.warn(
        '[ifcItemsMapParity] no FlatMesh capture from parse — ' +
        'skipping parity check (web-ifc-three may not have called ' +
        'StreamAllMeshes for this load)')
      return
    }
    const conway = itemsMapFromFlatMeshes(
      capturedFlatMeshes, ifcAPI, modelID, {geometry: geom})
    const cmp = compareItemsMaps(perVertex, conway)
    // Conway-level shape: how many PlacedGeometries fit under how
    // many FlatMeshes? `placedCount > flatMeshCount` means some
    // FlatMeshes have multiple PlacedGeometries. Two distinct
    // sub-cases hide there:
    //   (i)  IfcMappedItem-style instances: many PlacedGeometries
    //        SHARE one `geometryExpressID` and differ only in their
    //        flatTransformation. Per-instance picking is the right
    //        answer for these.
    //   (ii) Compound representation: one IFC element's geometry is
    //        built from N distinct geometric primitives, each with
    //        its own `geometryExpressID`. Subcomponents are not
    //        independently selectable in IFC semantics; per-instance
    //        picking would be wrong here.
    // Tracking shared vs unique geometryExpressIDs across the
    // multi-placed FlatMeshes tells us the mix.
    let flatMeshCount = 0
    let placedCount = 0
    let multiPlacedFlatMeshes = 0
    let maxPlacedInOneFlatMesh = 0
    // Case (i) and (ii) accounting across multi-placed FlatMeshes:
    let sharedShapeInstances = 0 // PlacedGeometries that share a geomExpressID with a sibling
    let uniqueShapeInstances = 0 // PlacedGeometries with a geomExpressID unique within the FlatMesh
    let multiPlacedAllShared = 0 // FlatMeshes where every placedGeom shares one geomExpressID (pure case i)
    let multiPlacedAllUnique = 0 // FlatMeshes where every placedGeom has a unique geomExpressID (pure case ii)
    let multiPlacedMixed = 0 // FlatMeshes that are a mix
    for (const fm of capturedFlatMeshes) {
      flatMeshCount++
      const g = fm?.geometries
      const n = typeof g?.size === 'function' ? g.size() : (g?.length ?? 0)
      placedCount += n
      if (n > 1) {
        multiPlacedFlatMeshes++
        // Count occurrences of each geomExpressID inside this FlatMesh.
        const counts = new Map()
        for (let i = 0; i < n; i++) {
          const placed = typeof g.get === 'function' ? g.get(i) : g[i]
          const id = placed?.geometryExpressID
          counts.set(id, (counts.get(id) ?? 0) + 1)
        }
        let sharedHere = 0
        let uniqueHere = 0
        for (const c of counts.values()) {
          if (c > 1) {
            sharedHere += c
          } else {
            uniqueHere += c
          }
        }
        sharedShapeInstances += sharedHere
        uniqueShapeInstances += uniqueHere
        if (sharedHere === n) {
          multiPlacedAllShared++
        } else if (uniqueHere === n) {
          multiPlacedAllUnique++
        } else {
          multiPlacedMixed++
        }
      }
      if (n > maxPlacedInOneFlatMesh) {
        maxPlacedInOneFlatMesh = n
      }
    }
    console.warn(
      `[ifcItemsMapParity] modelID=${modelID} ` +
      `perVertexElements=${perVertex.elementCount} ` +
      `conwayElements=${conway.elementCount} ` +
      `perVertexTriangles=${perVertex.triangleCount} ` +
      `conwayTriangles=${conway.triangleCount} ` +
      `${formatComparison(cmp)}`)
    console.warn(
      `[ifcItemsMapParity] Conway emission: flatMeshes=${flatMeshCount} ` +
      `placedGeometries=${placedCount} ` +
      `multiPlacedFlatMeshes=${multiPlacedFlatMeshes} ` +
      `maxPlacedInOneFlatMesh=${maxPlacedInOneFlatMesh}`)
    console.warn(
      `[ifcItemsMapParity] multi-placed breakdown: ` +
      `allShared=${multiPlacedAllShared} ` +
      `allUnique=${multiPlacedAllUnique} ` +
      `mixed=${multiPlacedMixed} ` +
      `sharedShapeInstances=${sharedShapeInstances} ` +
      `uniqueShapeInstances=${uniqueShapeInstances}`)
    // First few count deltas, for spot-checking emission-order issues.
    if (cmp.triangleCountDeltas.length > 0) {
      const head = cmp.triangleCountDeltas.slice(0, 5)
        .map((d) => `${d.id}:${d.a}vs${d.b}`).join(' ')
      console.warn(`[ifcItemsMapParity] sample triCountDeltas: ${head}`)
    }
    if (cmp.onlyInB > 0) {
      console.warn(
        `[ifcItemsMapParity] Conway sees ${cmp.onlyInB} additional ` +
        'instance IDs — this is the IfcMappedItem per-instance ' +
        'delta the per-vertex path collapses')
    }
    if (!cmp.agreeingTriangleCounts) {
      console.warn(
        `[ifcItemsMapParity] ${cmp.triangleCountDeltas.length} IDs ` +
        'have triangle-count deltas — emission order may differ; ' +
        'investigate before promoting Conway-direct')
    }
  } catch (e) {
    console.warn('[ifcItemsMapParity] check failed:', e)
  }
}
