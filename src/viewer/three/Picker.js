// Adapted from web-ifc-viewer/components/context/raycaster.js
import {Object3D, Raycaster} from 'three'
import {assertDefined} from '../../utils/assert'
import ThreeContext from './ThreeContext'
import {visibleHits} from './visibleHits'


/** Uses the THREE raycaster to pick items in the scene. */
export default class Picker {
  /** @param {ThreeContext} ctx layered three context */
  constructor(ctx) {
    assertDefined(ctx)
    this.context = ctx
    this.raycaster = new Raycaster()
  }


  /** Frees context and raycaster resources. */
  dispose() {
    this.context = null
    this.raycaster = null
  }


  /**
   * Uses the current context's camera to do raycasting on the given item's
   * subgraphs.
   *
   * @param {Array<Object3D>} items
   * @return {Array<object>} three.js intersections, nearest first, without
   *   those on clipped-away geometry, and only those on the cut-plane gizmo
   *   when the ray crosses it
   */
  castRay(items) {
    const camera = this.context.getCamera()
    this.raycaster.setFromCamera(this.context.getNormalizedMousePosition(), camera)
    // Only what the user sees under the pointer: see visibleHits.js.
    return visibleHits(this.raycaster.intersectObjects(items), this.raycaster, this.context)
  }


  /**
   * @return {object|null} the nearest unclipped hit on the pickable models
   */
  castRayIfc() {
    return this.castRay(this.context.getPickableModels())[0] ?? null
  }
}
