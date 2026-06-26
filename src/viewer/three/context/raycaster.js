// IfcRaycaster — vendored from
// `web-ifc-viewer/dist/components/context/raycaster.js` in slice 5d.3.

import {Raycaster} from 'three'
import {IfcComponent} from './base-types'


export class IfcRaycaster extends IfcComponent {
  constructor(context) {
    super(context)
    this.context = context
    this.raycaster = new Raycaster()
  }
  dispose() {
    this.raycaster = null
    this.context = null
  }
  castRay(items) {
    const camera = this.context.getCamera()
    this.raycaster.setFromCamera(this.context.mouse.position, camera)
    return this.raycaster.intersectObjects(items)
  }
  castRayIfc() {
    const items = this.castRay(this.context.items.pickableIfcModels)
    const filtered = this.filterClippingPlanes(items)
    return filtered.length > 0 ? filtered[0] : null
  }
  filterClippingPlanes(objs) {
    const planes = this.context.getClippingPlanes()
    if (objs.length <= 0 || !planes || (planes === null || planes === void 0 ? void 0 : planes.length) <= 0) {
      return objs
    }
    // const planes = this.clipper?.planes.map((p) => p.plane);
    return objs.filter((elem) => planes.every((elem2) => elem2.distanceToPoint(elem.point) > 0))
  }
}
// # sourceMappingURL=raycaster.js.map
