// Visible diagnostics for the GLB pipeline.
//
// The repo's default debug level is WARN, so debug().log(...) at INFO is
// silenced — which made the writer/reader effectively undetectable. These
// helpers route milestone events through console.info with a stable
// `[glb]` prefix so users can grep the console without flipping the debug
// level globally.
//
// Console policy (conway #301 §6 — a clean load should leave a quiet
// console): `glbInfo` is for per-load milestones a user/triager needs at a
// glance — cache HIT/MISS, parse summary, anomalies (0 meshes, lookup
// failures), writer completion. Everything else (cache keys, BVH/instance-
// map/NavTree hydration detail, picking sources) goes through `glbVerbose`
// and is gated on the `glbVerbose` feature flag. When adding a call site,
// default to `glbVerbose` unless the line earns its place in every load's
// console.
import {isFeatureEnabled} from '../FeatureFlags'
import {createLogChannel} from '../utils/logSink'


// `createLogChannel` owns the console default and the globalThis-hosted
// swappable sink (see its docs for why the sink can't be module state).
const channel = createLogChannel('[glb]', '__bldrsGlbLogSink')


/**
 * Swap the `[glb]` log sink. Tests install a capturing sink so these
 * diagnostics are asserted against a buffer instead of printed — a clean load
 * (and a clean test run) leaves a quiet console (conway #301 §6). Passing
 * null/undefined restores the console sink.
 *
 * @param {?function(string, Array<*>): void} fn (level, args) => void
 */
export function setGlbLogSink(fn) {
  channel.setSink(fn)
}


/**
 * Milestone log: visible whenever called (the caller is expected to gate on
 * `isFeatureEnabled('glb')` already). Routed through the sink (console.info by
 * default) so it's discoverable without changing the debug level.
 *
 * @param {...*} args
 */
export function glbInfo(...args) {
  channel.emit('info', args)
}


/**
 * Anomaly/error diagnostic for the GLB pipeline (cache-write skips, reader
 * face_ids failures, out-of-range extension refs). Same `[glb]` prefix and
 * sink as `glbInfo`, at warn level — one place for the pipeline's error-path
 * console.warns so tests can capture and assert them.
 *
 * @param {...*} args
 */
export function glbWarn(...args) {
  channel.emit('warn', args)
}


/**
 * Verbose log: only fires when the `glbVerbose` feature flag is on. Use for
 * cache-key descriptors, modelID, geometry size, chunk counts — anything a
 * debugging user wants but a casual user doesn't.
 *
 * @param {...*} args
 */
export function glbVerbose(...args) {
  if (isFeatureEnabled('glbVerbose')) {
    channel.emit('info', args)
  }
}
