import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three'


/**
 * CutPlaneArrowHelper - Helper class for creating arrow helpers for cutting planes.
 */
export default class CutPlaneArrowHelper extends Group {
  material: MeshBasicMaterial

  /**
   * @param direction - The direction of the arrow.
   * @param color - The color of the arrow.
   * @param length - Total arrow length.
   * @param headLength - The length of each arrow head.
   * @param headWidth - The width of each arrow head.
   * @param shaftRadius - The radius of the arrow shaft.
   */
  constructor(
    direction: Vector3,
    color = 0x00ff00,
    length = 1,
    headLength = 0.1,
    headWidth = 0.05,
    shaftRadius = 0.012,
  ) {
    super()
    this.name = 'CutPlaneArrowHelper'

    const normalizedDirection = direction.clone().normalize()

    this.material = new MeshBasicMaterial({color})

    const shaftHeight = Math.max(length - (headLength * 2), 0)
    const shaftGeometryHeight = Math.max(shaftHeight, MIN_SHAFT_HEIGHT)
    const shaftGeometry = new CylinderGeometry(shaftRadius, shaftRadius, shaftGeometryHeight, SHAFT_RADIAL_SEGMENTS)
    const shaft = new Mesh(shaftGeometry, this.material)
    this.add(shaft)

    const headGeometry = new ConeGeometry(headWidth / 2, headLength, HEAD_RADIAL_SEGMENTS)
    const halfHeadLength = headLength / 2
    const headOffset = (shaftHeight / 2) + halfHeadLength
    const head = new Mesh(headGeometry, this.material)
    head.position.y = headOffset
    this.add(head)

    const tail = new Mesh(headGeometry.clone(), this.material)
    tail.rotation.x = Math.PI
    tail.position.y = -headOffset
    this.add(tail)

    /*
    const debugSphereGeometry = new SphereGeometry(pickingRadius, HEAD_RADIAL_SEGMENTS, HEAD_RADIAL_SEGMENTS)
    const debugSphere = new Mesh(debugSphereGeometry, this.material.clone())
    debugSphere.material.transparent = true
    debugSphere.material.opacity = 0.25
    debugSphere.name = 'CutPlaneArrowHelperDebugSphere'
    this.add(debugSphere)
    */
    const defaultDirection = new Vector3(0, 1, 0)
    const quaternion = new Quaternion().setFromUnitVectors(defaultDirection, normalizedDirection)
    this.applyQuaternion(quaternion)
  }

  /**
   * Sets the color of the arrow.
   *
   * @param color - The color to set.
   */
  setColor(color: number) {
    this.material.color.setHex(color)
  }
}


const MIN_SHAFT_HEIGHT = 0.001
const SHAFT_RADIAL_SEGMENTS = 16
const HEAD_RADIAL_SEGMENTS = 32
