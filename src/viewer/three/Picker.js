// Adapted from web-ifc-viewer/components/context/raycaster.js
import {Object3D, Raycaster} from 'three'
import {assertDefined} from '../../utils/assert'
import ThreeContext from './ThreeContext'
import {unclippedHits} from './clippedHits'
import {finiteHits} from './finiteHits'


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
   *   those on clipped-away geometry
   */
  castRay(items) {
    const camera = this.context.getCamera()
    this.raycaster.setFromCamera(this.context.getNormalizedMousePosition(), camera)
    // finiteHits: three r187's watertight triangle test reports a NaN-vertex
    // triangle as a hit at distance NaN; see finiteHits.js. unclippedHits:
    // a hit the cut planes removed from view is no pick (#2131); see
    // clippedHits.js. IfcRaycaster#castRay (hover) does the same.
    return unclippedHits(
      finiteHits(this.raycaster.intersectObjects(items)),
      this.context.getClippingPlanes())
  }


  /**
   * @return {object|null} the nearest unclipped hit on the pickable models
   */
  castRayIfc() {
    return this.castRay(this.context.getPickableModels())[0] ?? null
  }
}
