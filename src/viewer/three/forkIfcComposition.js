// forkIfcComposition — composition root for the fork piece we still
// need: `IfcManager` (web-ifc-three IFCLoader + IfcSelector + IfcProperties
// + IfcUnits behind one constructor).
//
// Slice 5d.3 of design/new/viewer-replacement.md Phase 5. ShareViewer
// used to call `new IfcViewerAPI(options)` for the fork pieces; 5d.3
// swapped to our vendored `IfcContext` (`src/viewer/three/context/`) and
// direct `new IfcManager(context)`. This module centralises the deep
// import so `__mocks__/web-ifc-viewer.js` can stay the single mock
// surface for the fork (vs. having to mock each deep
// `web-ifc-viewer/dist/components/...` path separately).
//
// Slice 5d.2 dropped the fork's `IfcClipper` — all clipping now runs
// through the in-repo `MeshClipper` (see `src/viewer/three/Clipper.js`),
// so this module no longer constructs it. `IfcManager` is the last fork
// construct ShareViewer instantiates; replacing it with a standalone
// `ShareIfcManager`-style surface (selector + properties + units) is the
// remaining work before 5d.4 can delete this module + the `web-ifc-viewer`
// dependency entirely.
//
// Lifetime: the value returned here has references inside fork-side
// objects (IfcSelector captures `loader`, IfcProperties captures
// `loader`, …) — once constructed it outlives any temporary holder.
// Don't reuse a single `makeForkIfc` return across viewer disposes; build
// a new one per ShareViewer.

import {IfcManager} from 'web-ifc-viewer/dist/components/ifc/ifc-manager'


/**
 * Build the fork-side IfcManager against our vendored IfcContext.
 *
 * @param {object} ifcContext our vendored `IfcContext` (the fork
 *   constructs its sub-objects with the same `context.addComponent`
 *   / `context.items` / `context.castRayIfc` surface our IfcContext
 *   provides — identical because we vendored from the fork).
 * @return {{IFC: object}}
 */
export function makeForkIfc(ifcContext) {
  const IFC = new IfcManager(ifcContext)
  return {IFC}
}
