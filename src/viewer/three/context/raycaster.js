// IfcRaycaster — vendored from
// `web-ifc-viewer/dist/components/context/raycaster.js` in slice 5d.3.

import {Raycaster} from 'three'
import {IfcComponent} from './base-types'
import {visibleHits} from '../visibleHits'


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
    // Only what the user sees under the pointer: see ../visibleHits.js.
    return visibleHits(this.raycaster.intersectObjects(items), this.raycaster, this.context)
  }
  castRayIfc() {
    const items = this.castRay(this.context.items.pickableIfcModels)
    return items.length > 0 ? items[0] : null
  }
}
// # sourceMappingURL=raycaster.js.map
