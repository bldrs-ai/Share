// Adapted from web-ifc-viewer/components/context/raycaster.js
import {Object3D, Raycaster} from 'three'
import {assertDefined} from '../utils/assert'


/** Uses the THREE raycaster to pick items in the scene. */
export default class Picker {
  /** @param {object} ctx web-ifc-viewer context */
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
   * @return {Array<Object3D>|null}
   */
  castRay(items) {
    const camera = this.context.getCamera()
    this.raycaster.setFromCamera(this.context.mouse.position, camera)
    return this.raycaster.intersectObjects(items)
  }


  /**
   * @return {Array<Object3D>}
   */
  castRayIfc() {
    const items = this.castRay(this.context.items.pickableIfcModels)
    const filtered = this.filterClippingPlanes(items)
    return filtered.length > 0 ? filtered[0] : null
  }


  /**
   * @param {Array<Object3D>} objs
   * @return {Array<Object3D>}
   */
  #filterClippingPlanes(objs) {
    const planes = this.context.getClippingPlanes()
    if (objs.length <= 0 || !planes || (planes === null || planes === void 0 ? void 0 : planes.length) <= 0) {
      return objs
    }
    return objs.filter((elem) => planes.every((elem2) => elem2.distanceToPoint(elem.point) > 0))
  }
}
