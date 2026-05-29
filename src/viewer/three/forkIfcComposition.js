// forkIfcComposition — composition root for the fork pieces we still
// need: `IfcManager` (web-ifc-three IFCLoader + IfcSelector + IfcProperties
// + IfcUnits behind one constructor) and `IfcClipper` (IFC clipping
// planes + ClippingEdges).
//
// Slice 5d.3 of design/new/viewer-replacement.md Phase 5. ShareViewer
// used to call `new IfcViewerAPI(options)` for these; 5d.3 swapped to
// our vendored `IfcContext` (`src/viewer/three/context/`) and direct
// `new IfcManager(context)` / `new IfcClipper(context, IFC)`. This
// module centralises those deep imports — `__mocks__/web-ifc-viewer.js`
// can stay the single mock surface for the fork (vs. having to mock
// each deep `web-ifc-viewer/dist/components/...` path separately).
//
// Lifetime: the values returned here have references inside fork-side
// objects (IfcSelector captures `loader`, IfcProperties captures
// `loader`, ClippingEdges captures `ifc.loader.ifcManager`, …) — once
// constructed they outlive any temporary holder. Don't reuse a single
// `makeForkIfc` return across viewer disposes; build a new one per
// ShareViewer.
//
// 5d.2 (clipper unification) and a later slice replacing fork's
// IfcManager surface will reduce this to one or zero callers; the
// module goes away when both are done.

import {IfcManager} from 'web-ifc-viewer/dist/components/ifc/ifc-manager'
import {IfcClipper} from 'web-ifc-viewer/dist/components/display/clipping-planes/clipper'


/**
 * Build fork-side IfcManager + IfcClipper against our vendored IfcContext.
 *
 * @param {object} ifcContext our vendored `IfcContext` (the fork
 *   construct its sub-objects with the same `context.addComponent`
 *   / `context.items` / `context.castRayIfc` surface our IfcContext
 *   provides — identical because we vendored from the fork).
 * @return {{IFC: object, clipper: object}}
 */
export function makeForkIfc(ifcContext) {
  const IFC = new IfcManager(ifcContext)
  const clipper = new IfcClipper(ifcContext, IFC)
  return {IFC, clipper}
}
