// Visible diagnostics for the GLB pipeline.
//
// The repo's default debug level is WARN, so debug().log(...) at INFO is
// silenced — which made the writer/reader effectively undetectable. These
// helpers route milestone events through console.info with a stable
// `[glb]` prefix so users can grep the console without flipping the debug
// level globally. Verbose detail (cache-key descriptor, modelID, etc.) is
// gated on the `glbVerbose` feature flag.
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
