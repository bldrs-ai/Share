/**
 * Test seam for the geometry pump, read by both engines' loads
 * (`conwayDirectIfcLoader.js` on the main thread, `engine/engineModelLoad.js`
 * for the worker): `window.__bldrsTestPumpBatchSize` sets the pump's batch
 * size, so a spec can make a small fixture's assemblies arrive over several
 * batches (streamingBatchPick.spec.ts). Absent in production, where this is a
 * property read per load.
 *
 * @return {number|undefined} the size, or undefined to keep the default
 */
export function testPumpBatchSize() {
  const size = globalThis.__bldrsTestPumpBatchSize
  return Number.isInteger(size) && size > 0 ? size : undefined
}
