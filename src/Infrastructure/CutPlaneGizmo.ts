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
 * Visual gizmo for a clipping plane — transparent grid pattern with border.
 * Uses the theme's primary color.
 */
export default class CutPlaneGizmo extends Group {
  gridMaterial: LineBasicMaterial
  borderMaterial: LineBasicMaterial

  constructor(
    direction: Vector3,
    size: number,
    color?: number,
    gridDivisions = 20,
  ) {
    if (color === undefined) {
      const cssColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()
      color = cssColor ? parseInt(cssColor.replace('#', ''), 16) : 0x00ff00
    }
    super()
    this.name = 'CutPlaneGizmo'

    const normalizedDirection = direction.clone().normalize()
    const half = size / 2
    const step = size / gridDivisions

    // Grid lines
    const gridPoints: number[] = []
    for (let i = 0; i <= gridDivisions; i++) {
      const pos = -half + i * step
      gridPoints.push(-half, pos, 0, half, pos, 0)
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

    // Border
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

    // Align to direction
    const defaultNormal = new Vector3(0, 0, 1)
    const quaternion = new Quaternion().setFromUnitVectors(defaultNormal, normalizedDirection)
    this.applyQuaternion(quaternion)
  }

  setHighlight(highlighted: boolean): void {
    this.gridMaterial.opacity = highlighted ? 0.3 : 0.15
    this.borderMaterial.opacity = highlighted ? 1.0 : 0.5
  }

  dispose(): void {
    this.children.forEach((child) => {
      if ((child as LineSegments).geometry) (child as LineSegments).geometry.dispose()
    })
    this.gridMaterial.dispose()
    this.borderMaterial.dispose()
  }
}
