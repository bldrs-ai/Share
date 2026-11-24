import {PREVIEW_FINISH_PARSE} from '@bldrs-ai/conway/src/compat/web-ifc/streamed_preview_channel'


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


/**
 * Test seam: `window.__bldrsTestStepPreviewFinishParse === true` turns on
 * conway's parked parse-end preview tick (`PREVIEW_FINISH_PARSE`,
 * conway#773) for the loads on this page, so a spec can put STEP preview
 * meshes on screen and pick them (stepPreviewPick.spec.ts). Test-only and off
 * by default: conway parks the tick because on the large corpus models it
 * delays the index (+0.5 s on Arty_Z7). Never set in production.
 *
 * @return {boolean}
 */
export function testStepPreviewFinishParse() {
  return globalThis.__bldrsTestStepPreviewFinishParse === true
}


/**
 * Turn the parse-end preview tick on in THIS engine's conway (the page's for
 * the main-thread engine, the worker's own for the engine worker: each bundle
 * has its own module instance). Only ever turns it on, so a conway that
 * enables it by default (conway#773) is never overridden off.
 */
export function enableStepPreviewFinishParse() {
  PREVIEW_FINISH_PARSE.enabled = true
}
