import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Quaternion,
  Vector3,
} from 'three'


/**
 * Visual gizmo for a clipping plane — transparent grid pattern.
 * This is purely visual — actual clipping is handled separately.
 */
export default class CutPlaneGizmo extends Group {
  gridMaterial: LineBasicMaterial
  borderMaterial: LineBasicMaterial

  constructor(
    direction: Vector3,
    size: number,
    color = 0x888888,
    gridDivisions = 20,
  ) {
    super()
    this.name = 'CutPlaneGizmo'

    const normalizedDirection = direction.clone().normalize()
    const half = size / 2
    const step = size / gridDivisions

    // Build grid lines
    const gridPoints: number[] = []
    for (let i = 0; i <= gridDivisions; i++) {
      const pos = -half + i * step
      // Lines along X
      gridPoints.push(-half, pos, 0, half, pos, 0)
      // Lines along Y
      gridPoints.push(pos, -half, 0, pos, half, 0)
    }

    const gridGeom = new BufferGeometry()
    gridGeom.setAttribute('position', new BufferAttribute(new Float32Array(gridPoints), 3))

    this.gridMaterial = new LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.15,
      depthTest: false,
    })

    const grid = new LineSegments(gridGeom, this.gridMaterial)
    grid.renderOrder = 998
    this.add(grid)

    // Border (outer rectangle, slightly brighter)
    const borderPoints = new Float32Array([
      -half, -half, 0, half, -half, 0,
      half, -half, 0, half, half, 0,
      half, half, 0, -half, half, 0,
      -half, half, 0, -half, -half, 0,
    ])
    const borderGeom = new BufferGeometry()
    borderGeom.setAttribute('position', new BufferAttribute(borderPoints, 3))

    this.borderMaterial = new LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.5,
      depthTest: false,
    })

    const border = new LineSegments(borderGeom, this.borderMaterial)
    border.renderOrder = 999
    this.add(border)

    // Align to direction (PlaneGeometry default normal is Z)
    const defaultNormal = new Vector3(0, 0, 1)
    const quaternion = new Quaternion().setFromUnitVectors(defaultNormal, normalizedDirection)
    this.applyQuaternion(quaternion)
  }

  setHighlight(highlighted: boolean): void {
    this.gridMaterial.opacity = highlighted ? 0.3 : 0.15
    this.borderMaterial.opacity = highlighted ? 0.8 : 0.5
  }

  dispose(): void {
    this.children.forEach((child) => {
      if ((child as LineSegments).geometry) (child as LineSegments).geometry.dispose()
    })
    this.gridMaterial.dispose()
    this.borderMaterial.dispose()
  }
}
