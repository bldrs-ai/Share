/* eslint-disable no-magic-numbers */
import {Group, Mesh, Vector3, MeshBasicMaterial} from 'three'
import CutPlaneArrowHelper from './CutPlaneArrowHelper'


describe('Infrastructure/CutPlaneArrowHelper', () => {
  describe('construction', () => {
    it('extends Group', () => {
      const arrow = new CutPlaneArrowHelper(new Vector3(0, 1, 0))
      expect(arrow).toBeInstanceOf(Group)
    })

    it('has name "CutPlaneArrowHelper"', () => {
      const arrow = new CutPlaneArrowHelper(new Vector3(0, 1, 0))
      expect(arrow.name).toBe('CutPlaneArrowHelper')
    })

    it('exposes a MeshBasicMaterial with the given color', () => {
      const arrow = new CutPlaneArrowHelper(new Vector3(0, 1, 0), 0xff0000)
      expect(arrow.material).toBeInstanceOf(MeshBasicMaterial)
      expect(arrow.material.color.getHex()).toBe(0xff0000)
    })

    it('creates exactly 3 children: shaft + head + tail', () => {
      const arrow = new CutPlaneArrowHelper(new Vector3(0, 1, 0))
      expect(arrow.children.length).toBe(3)
      arrow.children.forEach((child) => expect(child).toBeInstanceOf(Mesh))
    })

    it('places the head at +offset and the tail at -offset', () => {
      const length = 2
      const headLength = 0.2
      const arrow = new CutPlaneArrowHelper(new Vector3(0, 1, 0), 0x00ff00, length, headLength)

      const [shaft, head, tail] = arrow.children
      // shaft is centered at y=0
      expect(shaft.position.y).toBeCloseTo(0, 5)
      // head is at +(shaftHeight/2 + headLength/2)
      const shaftHeight = length - (headLength * 2)
      const expectedOffset = (shaftHeight / 2) + (headLength / 2)
      expect(head.position.y).toBeCloseTo(expectedOffset, 5)
      // tail mirrors head
      expect(tail.position.y).toBeCloseTo(-expectedOffset, 5)
    })

    it('clamps shaft height to 0.001 when length < 2 * headLength', () => {
      // headLength=0.6, so 2*0.6=1.2 > length=1 → shaftHeight computed
      // would be -0.2, clamped to MIN_SHAFT_HEIGHT=0.001
      const arrow = new CutPlaneArrowHelper(new Vector3(0, 1, 0), 0xffffff, 1, 0.6)
      const shaftGeometry = (arrow.children[0] as Mesh).geometry
      // CylinderGeometry height is the second positional arg; we verify
      // via the geometry's bounding box height being close to 0.001.
      shaftGeometry.computeBoundingBox()
      const bb = shaftGeometry.boundingBox
      if (bb === null) {
        throw new Error('boundingBox not set after computeBoundingBox()')
      }
      const shaftHeightActual = bb.max.y - bb.min.y
      expect(shaftHeightActual).toBeCloseTo(0.001, 3)
    })

    it('rotates to align with an arbitrary direction', () => {
      // A Y-up arrow should have no rotation; an X-right arrow should
      // be rotated 90 degrees around Z.
      const yArrow = new CutPlaneArrowHelper(new Vector3(0, 1, 0))
      const xArrow = new CutPlaneArrowHelper(new Vector3(1, 0, 0))

      // The quaternion for the Y arrow should be identity (no rotation).
      expect(yArrow.quaternion.x).toBeCloseTo(0, 5)
      expect(yArrow.quaternion.y).toBeCloseTo(0, 5)
      expect(yArrow.quaternion.z).toBeCloseTo(0, 5)
      expect(yArrow.quaternion.w).toBeCloseTo(1, 5)

      // The X arrow should differ from identity.
      const q = xArrow.quaternion
      const isIdentity = Math.abs(q.w - 1) < 0.001 &&
        Math.abs(q.x) < 0.001 &&
        Math.abs(q.y) < 0.001 &&
        Math.abs(q.z) < 0.001
      expect(isIdentity).toBe(false)
    })
  })


  describe('setColor', () => {
    it('changes the material color', () => {
      const arrow = new CutPlaneArrowHelper(new Vector3(0, 1, 0), 0x00ff00)
      arrow.setColor(0x0000ff)
      expect(arrow.material.color.getHex()).toBe(0x0000ff)
    })
  })
})
