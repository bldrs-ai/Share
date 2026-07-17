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


/**
 * Milestone log: visible whenever called (the caller is expected to gate on
 * `isFeatureEnabled('glb')` already). Uses console.info so it's discoverable
 * without changing the debug level.
 *
 * @param {...*} args
 */
export function glbInfo(...args) {
  // eslint-disable-next-line no-console
  console.info('[glb]', ...args)
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
    // eslint-disable-next-line no-console
    console.info('[glb]', ...args)
  }
}
