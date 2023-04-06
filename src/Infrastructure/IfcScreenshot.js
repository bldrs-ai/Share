export default class IfcScreenshot {
  renderer = null
  /**
   * constructs new class
   *
   * @param {IfcRenderer} renderer IFC viewer's internal renderer
   */
  constructor(renderer) {
    this.renderer = renderer
  }

  async capture() {
    const dataURI = this.renderer.newScreenshot()

    const res = await fetch(dataURI)
    const img = await res.blob()

    return img
  }
}
