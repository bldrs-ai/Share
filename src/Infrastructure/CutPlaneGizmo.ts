import {
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three'


/**
 * Visual gizmo for a clipping plane — semi-transparent plane with border.
 * This is purely visual — actual clipping is handled separately.
 */
export default class CutPlaneGizmo extends Group {
  planeMaterial: MeshBasicMaterial
  edgeMaterial: LineBasicMaterial

  constructor(
    direction: Vector3,
    size: number,
    color = 0xFF6B35,
  ) {
    super()
    this.name = 'CutPlaneGizmo'

    const normalizedDirection = direction.clone().normalize()

    this.planeMaterial = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.12,
      side: DoubleSide,
      depthTest: false,
    })

    const geom = new PlaneGeometry(size, size)
    const planeMesh = new Mesh(geom, this.planeMaterial)
    planeMesh.renderOrder = 998
    this.add(planeMesh)

    this.edgeMaterial = new LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
      depthTest: false,
    })

    const edges = new EdgesGeometry(geom)
    const edgeLines = new LineSegments(edges, this.edgeMaterial)
    edgeLines.renderOrder = 999
    this.add(edgeLines)

    // PlaneGeometry default normal is (0, 0, 1)
    const defaultNormal = new Vector3(0, 0, 1)
    const quaternion = new Quaternion().setFromUnitVectors(defaultNormal, normalizedDirection)
    this.applyQuaternion(quaternion)
  }

  setHighlight(highlighted: boolean): void {
    this.planeMaterial.opacity = highlighted ? 0.25 : 0.12
    this.edgeMaterial.opacity = highlighted ? 1.0 : 0.6
  }
}
