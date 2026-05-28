// Postproduction — no-op stub. The fork's `web-ifc-viewer` builds a
// real `Postproduction` (EffectComposer + custom-outline-pass) on
// IfcRenderer; the fork's `IfcClipper.set active(...)` toggles its
// `.visible` field when clipping planes turn on/off. We don't use
// fork's outline path — `CustomPostProcessor` (src/viewer/three/) is
// our active postprocessing — so this stub only needs to satisfy the
// surface IfcRenderer and IfcClipper poke at:
//
//   - `visible`              boolean toggle (IfcClipper writes it)
//   - `setSize(w, h)`        called from IfcRenderer.adjustRendererSize
//   - `dispose()`            called from IfcRenderer.dispose
//   - `update()`             called from IfcRenderer.update (was the
//                            outline render in the fork; no-op for us)
//   - `htmlOverlay`          renderer reads this and appends to DOM
//                            on construction — needs to be a real Element
//                            (an empty `<div>` is enough; we never read
//                            from it).
//
// Slice 5d.3 of design/new/viewer-replacement.md Phase 5.

/**
 * Stub for the fork's `Postproduction`. Real postprocessing lives in
 * `src/viewer/three/CustomPostProcessor.js`.
 */
export class Postproduction {
  /**
   * @param {object} _context
   * @param {object} _renderer
   */
  constructor(_context, _renderer) {
    this.visible = false
    // IfcRenderer constructor appends `this.postProduction.htmlOverlay`
    // to the container. Real Postproduction returned a 2D-renderer
    // overlay; we hand back an empty div.
    this.htmlOverlay = typeof document !== 'undefined' ?
      document.createElement('div') :
      null
    if (this.htmlOverlay) {
      this.htmlOverlay.style.position = 'absolute'
      this.htmlOverlay.style.pointerEvents = 'none'
    }
  }


  /**
   * @param {number} _width
   * @param {number} _height
   */
  setSize(_width, _height) {
    // no-op
  }


  /**
   * Per-frame render hook. The fork composed an outline-effect render
   * here; we let `CustomPostProcessor` drive postprocessing instead.
   */
  update() {
    // no-op
  }


  dispose() {
    if (this.htmlOverlay && this.htmlOverlay.parentNode) {
      this.htmlOverlay.parentNode.removeChild(this.htmlOverlay)
    }
    this.htmlOverlay = null
  }
}
