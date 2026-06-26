// Vendored IfcContext family — re-exports.
//
// Slice 5d.3 of design/new/viewer-replacement.md Phase 5. Replaces
// `node_modules/web-ifc-viewer/dist/components/context/*`, which was
// the last fork-side rendering anchor for `ShareViewer`. Source was
// copied 1:1 from `web-ifc-viewer-1.0.209-bldrs-7.tgz`, then patched:
//
//   - `context.js`        — inline Clock shim (r183 deprecation)
//   - `scene.js`          — light intensities × Math.PI (r157 lights)
//   - `renderer/renderer.js` — Postproduction is now the local no-op
//                              stub (we own postprocessing via
//                              `CustomPostProcessor`)
//   - `camera/controls/{first-person,plan}-control.js` — no-op stubs;
//                              we only ever use Orbit
//
// Companion utility files: `base-types.js` (IfcComponent +
// NavigationModes / CameraProjections enums) + `LiteEvent.js`
// (small pub/sub used by IfcCamera + OrbitControl).

export {IfcContext} from './context'
export {IfcScene} from './scene'
export {IfcRenderer} from './renderer/renderer'
export {IfcCamera} from './camera/camera'
export {IfcRaycaster} from './raycaster'
export {IfcMouse} from './mouse'
export {Animator} from './animator'
export {IfcEvent, IfcEvents} from './ifcEvent'
export {NavigationModes, CameraProjections, IfcComponent} from './base-types'
export {LiteEvent} from './LiteEvent'
