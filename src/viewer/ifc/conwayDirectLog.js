// Visible diagnostics for the Conway-direct IFC pipeline.
//
// Both lines this channel carries are permanent integration-boundary
// signals, which is why they are console.* and not `debug()` (the repo's
// default level is WARN, so a debug() line would be invisible in the field):
//
//   - the per-load `parsed modelID=… vertices=…` summary — the single
//     observable proof that parse + assembly completed on a real model;
//     `src/loader/conwayDirect.spec.ts` and the deploy-preview smoke checks
//     gate on it.
//   - the parse failure — the only trace a load that returns null leaves.
//
// Routing them through a swappable sink keeps that production behavior
// (`[conwayDirect] <message>` on the console, unchanged wording) while
// letting jest divert them into a buffer and assert the values, per
// PLAYBOOK.md §"Keep the test console clean" move 2. `src/loader/glbLog.js`
// is the same pattern for the `[glb]` pipeline; both are built on
// `createLogChannel`, which documents why the sink lives on `globalThis`.
//
// Sibling `[conwayDirect]` lines in `conwayDirectIfcLoader.js` (demand-pump
// summary, occurrence-path mismatch) still call the console directly; move
// them here when a test needs to assert them.
import {createLogChannel} from '../../utils/logSink'


const channel = createLogChannel('[conwayDirect]', '__bldrsConwayDirectLogSink')


/**
 * Swap the `[conwayDirect]` log sink. Tests install a capturing sink
 * (`tools/jest/conwayDirectLogCapture.js`) so these diagnostics are asserted
 * against a buffer instead of printed. Passing null/undefined restores the
 * console sink.
 *
 * @param {?function(string, Array<*>): void} fn (level, args) => void
 */
export function setConwayDirectLogSink(fn) {
  channel.setSink(fn)
}


/**
 * Per-load milestone (console.info by default).
 *
 * @param {...*} args
 */
export function conwayDirectInfo(...args) {
  channel.emit('info', args)
}


/**
 * Error-path diagnostic (console.error by default).
 *
 * @param {...*} args
 */
export function conwayDirectError(...args) {
  channel.emit('error', args)
}
