// Whether the §6e render look (design/new/viewer-replacement.md §6e) is on:
// PBR materials with sRGB-tagged colours, the gradient-studio IBL, Khronos
// PBR-Neutral tone mapping, N8AO ambient occlusion and the contact-shadow
// ground. One decision, read when the viewer and its loaders build their
// materials, so a page never mixes the two pipelines. A theme change
// re-creates the viewer and reads it again.
//
// ON by default (the owner's preview check on #2167: the Neutral CAD preset
// with the gradient studio at 0.6, N8AO on). The switches mirror
// renderOnDemandMode.js:
//   - the ROLLBACK: `disableLook` set `isActive: true` in FeatureFlags.js
//     puts every viewer back on the pre-§6e pipeline (Lambert materials,
//     linear output, no IBL, no AO). A static `true` wins over every URL;
//   - `?feature=disableLook`, the per-session way back, for an A/B or a
//     render that looks wrong.
//   - the Playwright build only (`LOOK_IS_OPT_IN`, tools/esbuild/
//     vars.playwright.js): off unless the page set `window.__bldrsLookOptIn`
//     before load (`withLook`, src/tests/e2e/look.ts). CI's software
//     rasteriser pays for PBR + N8AO on every load, so the suite runs on the
//     pre-§6e pipeline and the look's own specs opt in.
// `?feature=look` no longer turns the look on (it is on); it opens the
// look-tuning panel and the FPS/ms/MB overlay at startup (lookPanels.js), the
// same panels the backtick key toggles.
import {flags, isFeatureEnabled} from '../FeatureFlags'


/** Why the look is off, by `lookOffReason`. */
export const LookOffReason = Object.freeze({
  // `disableLook` is on in FeatureFlags.js: the prod rollback.
  ROLLBACK: 'rollback',
  // `?feature=disableLook`, this session's kill switch.
  KILL_SWITCH: 'disableLook',
  // A Playwright build, and the spec didn't opt in.
  E2E_OPT_IN: 'e2eOptIn',
})


/**
 * @return {string|null} a `LookOffReason`, or null when the look is on
 */
export function lookOffReason() {
  // From the static flag alone first: the rollback must win over a URL.
  if (flags?.find((f) => f.name === 'disableLook')?.isActive) {
    return LookOffReason.ROLLBACK
  }
  if (isFeatureEnabled('disableLook')) {
    return LookOffReason.KILL_SWITCH
  }
  // A boolean from the esbuild define; Jest's process.env holds strings.
  const isOptIn = process.env.LOOK_IS_OPT_IN === true || process.env.LOOK_IS_OPT_IN === 'true'
  if (isOptIn && globalThis.__bldrsLookOptIn !== true) {
    return LookOffReason.E2E_OPT_IN
  }
  return null
}


/** @return {boolean} whether the §6e look is on for this viewer */
export function isLookOn() {
  return lookOffReason() === null
}
