import {Vector2} from 'three'


export class IfcMouse {
  constructor(domElement) {
    this.position = new Vector2()
    this.rawPosition = new Vector2()
    this.setupMousePositionUpdate(domElement)
  }
  setupMousePositionUpdate(domElement) {
    domElement.onmousemove = (event) => {
      this.rawPosition.x = event.clientX
      this.rawPosition.y = event.clientY
      const bounds = domElement.getBoundingClientRect()
      this.position.x = ((event.clientX - bounds.left) / (bounds.right - bounds.left)) * 2 - 1
      this.position.y = -((event.clientY - bounds.top) / (bounds.bottom - bounds.top)) * 2 + 1
    }
  }
}
// # sourceMappingURL=mouse.js.map
