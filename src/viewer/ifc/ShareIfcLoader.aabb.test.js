/* eslint-disable no-magic-numbers */
import {AABB_IMPOSTER_CAP, applyAabbImposter} from './ShareIfcLoader'


/**
 * @param {number} tx
 * @param {number} ty
 * @param {number} tz
 * @return {object}
 */
function makeMesh(tx, ty, tz) {
  const elements = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    tx, ty, tz, 1,
  ]
  return {matrix: {elements}, parent: null}
}


/**
 * @param {boolean} accept
 * @return {object}
 */
function makeSession(accept = true) {
  const previewGroup = {
    children: [],
    add(mesh) {
      mesh.parent = this
      this.children.push(mesh)
    },
    remove(mesh) {
      this.children = this.children.filter((child) => child !== mesh)
      if (mesh.parent === this) {
        mesh.parent = null
      }
    },
  }
  return {
    previewGroup,
    addPreviewMesh(mesh) {
      if (accept) {
        previewGroup.add(mesh)
      }
    },
  }
}


/**
 * @return {object}
 */
function makeRing() {
  return {meshes: [], origin: {xyz: null}, cap: AABB_IMPOSTER_CAP}
}


describe('viewer/ifc/ShareIfcLoader applyAabbImposter', () => {
  it('places the first box at the origin and later boxes relative to it', () => {
    const session = makeSession()
    const ring = makeRing()
    const first = makeMesh(100, 200, 300)
    const second = makeMesh(110, 200, 300)
    applyAabbImposter(first, session, ring)
    applyAabbImposter(second, session, ring)
    expect(first.matrix.elements[12]).toBe(0)
    expect(first.matrix.elements[13]).toBe(0)
    expect(first.matrix.elements[14]).toBe(0)
    expect(second.matrix.elements[12]).toBe(10)
    expect(second.matrix.elements[13]).toBe(0)
    expect(second.matrix.elements[14]).toBe(0)
    expect(ring.origin.xyz).toEqual([100, 200, 300])
  })


  it('does not write a durable coordination offset', () => {
    const session = makeSession()
    const ring = makeRing()
    const coordination = {offset: undefined}
    applyAabbImposter(makeMesh(8, 16, 24), session, ring)
    expect(coordination.offset).toBeUndefined()
    expect(ring.origin.xyz).toEqual([8, 16, 24])
  })


  it('drops the first accepted box when the 101st lands', () => {
    const session = makeSession()
    const ring = makeRing()
    const first = makeMesh(0, 0, 0)
    applyAabbImposter(first, session, ring)
    for (let i = 1; i < AABB_IMPOSTER_CAP; i++) {
      applyAabbImposter(makeMesh(i, 0, 0), session, ring)
    }
    expect(ring.meshes).toHaveLength(AABB_IMPOSTER_CAP)
    expect(session.previewGroup.children).toHaveLength(AABB_IMPOSTER_CAP)
    expect(session.previewGroup.children[0]).toBe(first)

    const extra = makeMesh(AABB_IMPOSTER_CAP, 0, 0)
    applyAabbImposter(extra, session, ring)
    expect(ring.meshes).toHaveLength(AABB_IMPOSTER_CAP)
    expect(session.previewGroup.children).toHaveLength(AABB_IMPOSTER_CAP)
    expect(session.previewGroup.children.includes(first)).toBe(false)
    expect(session.previewGroup.children.includes(extra)).toBe(true)
    expect(first.parent).toBeNull()
  })


  it('does not keep a mesh that addPreviewMesh rejected', () => {
    const accepting = makeSession(true)
    const ring = makeRing()
    for (let i = 0; i < 3; i++) {
      applyAabbImposter(makeMesh(i, 0, 0), accepting, ring)
    }
    const rejecting = {
      previewGroup: accepting.previewGroup,
      addPreviewMesh() {
        // Outlier: do not parent.
      },
    }
    const rejected = makeMesh(10000, 0, 0)
    applyAabbImposter(rejected, rejecting, ring)
    expect(ring.meshes).toHaveLength(3)
    expect(ring.meshes.includes(rejected)).toBe(false)
    expect(accepting.previewGroup.children).toHaveLength(3)
    expect(rejected.parent).toBeNull()
  })
})
