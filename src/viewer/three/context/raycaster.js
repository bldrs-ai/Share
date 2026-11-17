// IfcRaycaster — vendored from
// `web-ifc-viewer/dist/components/context/raycaster.js` in slice 5d.3.

import {Raycaster} from 'three'
import {IfcComponent} from './base-types'
import {unclippedHits} from '../clippedHits'
import {finiteHits} from '../finiteHits'


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
    // See ../finiteHits.js: three r187 reports NaN-vertex triangles as hits
    // at distance NaN. And ../clippedHits.js: a hit the cut planes removed
    // from view is no pick (#2131). Picker#castRay (click) does the same.
    return unclippedHits(
      finiteHits(this.raycaster.intersectObjects(items)),
      this.context.getClippingPlanes())
  }
  castRayIfc() {
    const items = this.castRay(this.context.items.pickableIfcModels)
    return items.length > 0 ? items[0] : null
  }
}
// # sourceMappingURL=raycaster.js.map
