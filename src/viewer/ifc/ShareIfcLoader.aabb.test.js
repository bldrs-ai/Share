/* eslint-disable no-magic-numbers */
import {AABB_IMPOSTER_CAP, applyAabbImposter, clearAabbImposters} from './ShareIfcLoader'


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
  return {meshes: [], byExpressID: new Map(), cap: AABB_IMPOSTER_CAP}
}


describe('viewer/ifc/ShareIfcLoader applyAabbImposter', () => {
  // Conway emits imposters in the durable coordination frame, so the
  // matrix that arrives is already where the box belongs. The old
  // re-anchor onto the first accepted box shifted every plate off the
  // durable geometry (conway#515 review findings).
  it('leaves the stamped matrix alone', () => {
    const session = makeSession()
    const ring = makeRing()
    const first = makeMesh(100, 200, 300)
    const second = makeMesh(110, 200, 300)
    applyAabbImposter(first, session, ring)
    applyAabbImposter(second, session, ring)
    expect(first.matrix.elements[12]).toBe(100)
    expect(first.matrix.elements[13]).toBe(200)
    expect(first.matrix.elements[14]).toBe(300)
    expect(second.matrix.elements[12]).toBe(110)
    expect(second.matrix.elements[13]).toBe(200)
    expect(second.matrix.elements[14]).toBe(300)
  })


  it('does not write a durable coordination offset', () => {
    const session = makeSession()
    const ring = makeRing()
    const coordination = {offset: undefined}
    const mesh = makeMesh(8, 16, 24)
    applyAabbImposter(mesh, session, ring)
    expect(coordination.offset).toBeUndefined()
    expect(mesh.matrix.elements[12]).toBe(8)
    expect(mesh.matrix.elements[13]).toBe(16)
    expect(mesh.matrix.elements[14]).toBe(24)
  })


  it('drops the first accepted box when the 101st lands', () => {
    const session = makeSession()
    const ring = makeRing()
    const first = makeMesh(0, 0, 0)
    applyAabbImposter(first, session, ring, 0)
    for (let i = 1; i < AABB_IMPOSTER_CAP; i++) {
      applyAabbImposter(makeMesh(i, 0, 0), session, ring, i)
    }
    expect(ring.meshes).toHaveLength(AABB_IMPOSTER_CAP)
    expect(session.previewGroup.children).toHaveLength(AABB_IMPOSTER_CAP)
    expect(session.previewGroup.children[0]).toBe(first)

    const extra = makeMesh(AABB_IMPOSTER_CAP, 0, 0)
    applyAabbImposter(extra, session, ring, AABB_IMPOSTER_CAP)
    expect(ring.meshes).toHaveLength(AABB_IMPOSTER_CAP)
    expect(session.previewGroup.children).toHaveLength(AABB_IMPOSTER_CAP)
    expect(session.previewGroup.children.includes(first)).toBe(false)
    expect(session.previewGroup.children.includes(extra)).toBe(true)
    expect(first.parent).toBeNull()
    // The evicted plate's key goes with it — otherwise a later
    // re-emission of expressID 0 would try to replace a detached mesh.
    expect(ring.byExpressID.size).toBe(AABB_IMPOSTER_CAP)
    expect(ring.byExpressID.has(0)).toBe(false)
    expect(ring.byExpressID.get(AABB_IMPOSTER_CAP)).toBe(extra)
  })


  // conway#519: the store path emits each spatial node twice by design —
  // an early coarse plate from a prefix generation, then a refined one
  // after the parse. The second emission refines the first in place.
  it('replaces the plate already drawn for the same expressID', () => {
    const session = makeSession()
    const ring = makeRing()
    const coarse = makeMesh(1, 2, 3)
    const refined = makeMesh(10, 20, 30)
    applyAabbImposter(coarse, session, ring, 42)
    applyAabbImposter(refined, session, ring, 42)
    expect(ring.meshes).toEqual([refined])
    expect(session.previewGroup.children).toEqual([refined])
    expect(coarse.parent).toBeNull()
    expect(session.previewGroup.children[0].matrix.elements[12]).toBe(10)
    expect(ring.byExpressID.size).toBe(1)
    expect(ring.byExpressID.get(42)).toBe(refined)
  })


  it('does not spend a cap slot on a replacement', () => {
    const session = makeSession()
    const ring = makeRing()
    for (let i = 0; i < AABB_IMPOSTER_CAP; i++) {
      applyAabbImposter(makeMesh(i, 0, 0), session, ring, i)
    }
    const oldest = ring.meshes[0]
    const refined = makeMesh(0, 0, 7)
    applyAabbImposter(refined, session, ring, AABB_IMPOSTER_CAP - 1)
    // A full ring plus a replacement is still a full ring, and the
    // replacement must not have evicted the oldest plate to make room.
    expect(ring.meshes).toHaveLength(AABB_IMPOSTER_CAP)
    expect(session.previewGroup.children).toHaveLength(AABB_IMPOSTER_CAP)
    expect(ring.meshes[0]).toBe(oldest)
    expect(oldest.parent).toBe(session.previewGroup)
    expect(ring.meshes[AABB_IMPOSTER_CAP - 1]).toBe(refined)
    expect(ring.byExpressID.size).toBe(AABB_IMPOSTER_CAP)
  })


  // A refused update must not delete standing scenery: the outlier guard
  // rejecting the NEW plate leaves the old one on screen and tracked.
  it('keeps the standing plate when its replacement is rejected', () => {
    const accepting = makeSession(true)
    const ring = makeRing()
    const standing = makeMesh(1, 1, 1)
    applyAabbImposter(standing, accepting, ring, 7)
    const rejecting = {
      previewGroup: accepting.previewGroup,
      addPreviewMesh() {
        // Outlier: do not parent.
      },
    }
    const rejected = makeMesh(10000, 0, 0)
    applyAabbImposter(rejected, rejecting, ring, 7)
    expect(ring.meshes).toEqual([standing])
    expect(accepting.previewGroup.children).toEqual([standing])
    expect(standing.parent).toBe(accepting.previewGroup)
    expect(rejected.parent).toBeNull()
    expect(ring.byExpressID.get(7)).toBe(standing)
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


  it('detaches every accepted box at the end of the load', () => {
    const session = makeSession()
    const ring = makeRing()
    const first = makeMesh(0, 0, 0)
    const second = makeMesh(4, 0, 0)
    applyAabbImposter(first, session, ring, 1)
    applyAabbImposter(second, session, ring, 2)
    expect(session.previewGroup.children).toHaveLength(2)
    clearAabbImposters(ring, session)
    expect(ring.meshes).toHaveLength(0)
    expect(ring.byExpressID.size).toBe(0)
    expect(session.previewGroup.children).toHaveLength(0)
    expect(first.parent).toBeNull()
    expect(second.parent).toBeNull()
  })
})
