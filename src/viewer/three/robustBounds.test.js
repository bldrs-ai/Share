import {
  BatchedMesh,
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three'
import {
  ElementBoxes,
  computeRobustBounds,
  robustBoundsFor,
  robustBoundsFromElements,
} from './robustBounds'


/** Building-scale stand-in span, in scene units. */
const MODEL_SIZE = 100
/** Far enough past the fences (one whole model-span) to read as a stray. */
const STRAY_DISTANCE = 1500
/** Triangle clusters per merged mesh: enough samples to clear MIN_SAMPLES. */
const CLUSTER_COUNT = 50
/** Cubes per batch: enough that one stray stays under the 2% budget. */
const CUBE_COUNT = 100
/** Antenna height as a fraction of MODEL_SIZE — tall but plausible. */
const ANTENNA_SPAN_FRACTION = 0.8
/** Extra clusters appended to trip the cache's count check. */
const TEN_MORE_CLUSTERS = 10
/** Half the edge of the unit boxes the streaming tests record. */
const UNIT_HALF_EXTENT = 0.5


/**
 * A merged-geometry mesh (the web-ifc scene shape): one flat position
 * buffer holding `clusterCount` unit triangles spread across MODEL_SIZE,
 * plus any extra [x, y, z] points appended verbatim.
 *
 * @param {number} clusterCount
 * @param {Array<Array<number>>} [extraPoints]
 * @return {Mesh}
 */
function mergedMesh(clusterCount, extraPoints = []) {
  const positions = []
  for (let i = 0; i < clusterCount; i++) {
    const base = (i / clusterCount) * MODEL_SIZE
    positions.push(base, 0, 0, base + 1, 0, 0, base, 1, 0)
  }
  for (const [x, y, z] of extraPoints) {
    positions.push(x, y, z)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  return new Mesh(geometry, new MeshBasicMaterial())
}


/**
 * A BatchedMesh of `count` unit cubes on a line across MODEL_SIZE (the
 * conway-direct scene shape), with optional extra instances at given
 * positions.
 *
 * @param {number} count
 * @param {Array<Array<number>>} [extraPositions]
 * @return {BatchedMesh}
 */
function batchedCubes(count, extraPositions = []) {
  const total = count + extraPositions.length
  const cubeVerts = 24
  const cubeIndices = 36
  const mesh = new BatchedMesh(
    total, cubeVerts, cubeIndices, new MeshBasicMaterial())
  const geometryId = mesh.addGeometry(new BoxGeometry(1, 1, 1))
  const matrix = new Matrix4()
  for (let i = 0; i < count; i++) {
    const instanceId = mesh.addInstance(geometryId)
    mesh.setMatrixAt(instanceId, matrix.makeTranslation((i / count) * MODEL_SIZE, 0, 0))
  }
  for (const [x, y, z] of extraPositions) {
    const instanceId = mesh.addInstance(geometryId)
    mesh.setMatrixAt(instanceId, matrix.makeTranslation(x, y, z))
  }
  return mesh
}


describe('viewer/three/robustBounds', () => {
  it('returns null for an object with no geometry', () => {
    expect(computeRobustBounds(new Object3D())).toBeNull()
  })

  it('matches setFromObject exactly on a clean merged mesh', () => {
    const root = new Object3D()
    root.add(mergedMesh(CLUSTER_COUNT))

    const result = computeRobustBounds(root)

    expect(result.excludedVertices).toBe(0)
    expect(result.excludedElements).toBe(0)
    const exact = new Box3().setFromObject(root)
    expect(result.box.min.toArray()).toEqual(exact.min.toArray())
    expect(result.box.max.toArray()).toEqual(exact.max.toArray())
  })

  it('keeps near-but-plausible geometry (a tall antenna) in the box', () => {
    // Most of a model-span above the roof is within the fences — must NOT
    // be treated as a stray ("only extreme outliers", issue #26 triage).
    const antennaHeight = MODEL_SIZE * ANTENNA_SPAN_FRACTION
    const root = new Object3D()
    root.add(mergedMesh(CLUSTER_COUNT, [[MODEL_SIZE / 2, 0, antennaHeight]]))

    const result = computeRobustBounds(root)

    expect(result.excludedVertices).toBe(0)
    expect(result.box.max.z).toEqual(antennaHeight)
  })

  it('excludes extreme stray vertices from a merged mesh', () => {
    const root = new Object3D()
    root.add(mergedMesh(CLUSTER_COUNT, [[0, 0, STRAY_DISTANCE], [STRAY_DISTANCE, 0, 0]]))

    const result = computeRobustBounds(root)

    expect(result.excludedVertices).toBe(2)
    expect(result.box.max.z).toBeLessThan(2)
    expect(result.box.max.x).toBeLessThanOrEqual(MODEL_SIZE + 1)
    // The unfiltered union still shows the strays.
    expect(result.exactBox.max.z).toEqual(STRAY_DISTANCE)
    expect(result.maxDistance).toBeGreaterThan(STRAY_DISTANCE / 2)
  })

  it('excludes an extreme stray instance from a BatchedMesh whole', () => {
    const root = new Object3D()
    root.add(batchedCubes(CUBE_COUNT, [[0, STRAY_DISTANCE, STRAY_DISTANCE]]))

    const result = computeRobustBounds(root)

    expect(result.excludedElements).toBe(1)
    expect(result.totalElements).toBe(CUBE_COUNT + 1)
    // Half a unit cube around the line of inlier cubes.
    expect(result.box.max.y).toBeLessThanOrEqual(1)
    expect(result.exactBox.max.y).toBeGreaterThan(STRAY_DISTANCE - 1)
  })

  it('excludes an element that starts inside but reaches the sky', () => {
    // The issue-26 catenaries run continuously from the building into the
    // sky — crossing the fence anywhere excludes the whole element.
    const root = new Object3D()
    const mesh = batchedCubes(CUBE_COUNT)
    const catenaryVerts = 6
    const catenary = new BufferGeometry()
    catenary.setAttribute('position', new BufferAttribute(new Float32Array([
      0, 0, 0, 1, 0, 0,
      0, 0, STRAY_DISTANCE, 1, 0, STRAY_DISTANCE,
      0, 1, 0, 0, 1, STRAY_DISTANCE,
    ]), 3))
    catenary.setIndex([0, 1, 2, 3, 4, 5])
    const bigEnough = new BatchedMesh(1, catenaryVerts, catenaryVerts, new MeshBasicMaterial())
    bigEnough.addInstance(bigEnough.addGeometry(catenary))
    root.add(mesh)
    root.add(bigEnough)

    const result = computeRobustBounds(root)

    expect(result.excludedElements).toBe(1)
    expect(result.box.max.z).toBeLessThanOrEqual(1)
  })

  it('keeps a balanced two-cluster layout unfiltered', () => {
    // Two clusters of comparable weight far apart is a layout, not
    // "model + strays" — the envelope covers both and nothing is cut.
    const root = new Object3D()
    const half = 25
    const farHalf = Array.from(
      {length: half * 3},
      (_, i) => [(STRAY_DISTANCE * 3) + (i % MODEL_SIZE), 0, 0])
    root.add(mergedMesh(half, farHalf))

    const result = computeRobustBounds(root)

    expect(result.excludedVertices).toBe(0)
    const exact = new Box3().setFromObject(root)
    expect(result.box.max.toArray()).toEqual(exact.max.toArray())
  })

  it('refuses to filter when too much of the model would go', () => {
    // A "stray" that is 7% of the model is not a stray — the
    // MAX_EXCLUDED_FRACTION guard keeps the exact box.
    const root = new Object3D()
    const clusterCount = 34
    const strayCount = 8
    const strays = Array.from(
      {length: strayCount},
      (_, i) => [(STRAY_DISTANCE * 3) + i, 0, 0])
    // 102 inlier + 8 stray vertices: the strays fit inside the trim floor
    // (so the envelope stays on the cluster) but exceed the 2% budget.
    root.add(mergedMesh(clusterCount, strays))

    const result = computeRobustBounds(root)

    expect(result.excludedVertices).toBe(0)
    const exact = new Box3().setFromObject(root)
    expect(result.box.max.toArray()).toEqual(exact.max.toArray())
  })

  it('respects mesh transforms when classifying', () => {
    // A mesh whose local coords are huge but whose transform brings it
    // home is not a stray (ArchiCAD writes site-frame breps like this).
    const root = new Object3D()
    const home = mergedMesh(CLUSTER_COUNT)
    const sited = mergedMesh(CLUSTER_COUNT)
    sited.geometry.translate(STRAY_DISTANCE, 0, 0)
    sited.position.set(-STRAY_DISTANCE, 0, 0)
    root.add(home, sited)

    const result = computeRobustBounds(root)

    expect(result.excludedVertices).toBe(0)
    expect(result.box.max.x).toBeLessThanOrEqual(MODEL_SIZE + 1)
  })

  describe('rotated BatchedMesh instances (#1896)', () => {
    /** The turn between a member's local frame and its placement: ~37°. */
    const TURN = Math.atan2(3, 4)
    const BEAM_LENGTH = 10
    const BEAM_SECTION = 0.3
    /** Off-grid scale and offset values, so no rounding is trivially exact. */
    const ODD_SCALE = 0.3
    const ODD_OFFSET = 1.7
    /** A georeferenced-scale coordinate, where float rounding bites. */
    const FAR = (MODEL_SIZE ** 2) * 10 / 3

    /**
     * A beam modelled diagonally in its own local frame and placed with the
     * opposite turn, so it lands along world x — the shape that over-framed
     * Snowdon's un-collapsed artifact. Its local AABB is a fat 8 × 6 m box
     * around a 0.3 m section; that box, placed, is what the old code framed.
     *
     * @return {BufferGeometry}
     */
    function turnedBeam() {
      return new BoxGeometry(BEAM_LENGTH, BEAM_SECTION, BEAM_SECTION).rotateZ(-TURN)
    }

    /**
     * @param {BufferGeometry} geometry
     * @param {Matrix4} placement the instance matrix
     * @return {{root: Object3D, mesh: BatchedMesh}} one instance in a batch
     */
    function oneInstance(geometry, placement) {
      const mesh = new BatchedMesh(
        1, geometry.attributes.position.count, geometry.index.count, new MeshBasicMaterial())
      mesh.setMatrixAt(mesh.addInstance(mesh.addGeometry(geometry)), placement)
      const root = new Object3D()
      root.add(mesh)
      root.updateWorldMatrix(true, true)
      return {root, mesh}
    }

    /**
     * What `collectBatchedElementBoxes` returned before #1896, kept here as
     * the reference: the instance's local box, placed.
     *
     * @param {BatchedMesh} mesh one-instance batch
     * @return {Box3}
     */
    function placedLocalBox(mesh) {
      const instance = new Matrix4()
      mesh.getMatrixAt(0, instance)
      const placed = new Matrix4().multiplyMatrices(mesh.matrixWorld, instance)
      return mesh.getBoundingBoxAt(0, new Box3()).applyMatrix4(placed)
    }

    /**
     * @param {BufferGeometry} geometry
     * @param {Matrix4} matrix local → world
     * @return {Box3} the box of the transformed vertices
     */
    function vertexBox(geometry, matrix) {
      return new Box3().setFromBufferAttribute(
        geometry.clone().applyMatrix4(matrix).attributes.position)
    }

    it('measures a rotated instance by its vertices, not its placed local box', () => {
      const geometry = turnedBeam()
      const placement = new Matrix4().compose(
        new Vector3(5, 2, 1),
        new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), TURN),
        new Vector3(1, 1, 1))
      const {root, mesh} = oneInstance(geometry, placement)
      // The batch's own transform is part of the placement too.
      mesh.position.set(MODEL_SIZE, 0, 0)
      root.updateWorldMatrix(true, true)
      const world = new Matrix4().multiplyMatrices(mesh.matrixWorld, placement)
      const exact = vertexBox(geometry, world)
      const overCovering = placedLocalBox(mesh)
      // The fixture has to tell the two answers apart, or the assertions
      // below could pass on the bug: ~9.9 m of y against a 0.3 m section.
      const exactSpanY = exact.max.y - exact.min.y
      expect(overCovering.max.y - overCovering.min.y).toBeGreaterThan(exactSpanY + (BEAM_LENGTH / 2))

      const result = computeRobustBounds(root)

      const digits = 5
      exact.min.toArray().forEach((v, axis) => expect(result.exactBox.min.getComponent(axis)).toBeCloseTo(v, digits))
      exact.max.toArray().forEach((v, axis) => expect(result.exactBox.max.getComponent(axis)).toBeCloseTo(v, digits))
      expect(result.box.max.y - result.box.min.y).toBeCloseTo(BEAM_SECTION, digits)
    })

    it('keeps an axis-aligned placement bit-for-bit (the collapsed path)', () => {
      // Every collapsed range carries a translation-only matrix (placement
      // is baked, glb-export-premium.md §1.1d), so this is the path the
      // collapsed artifact takes, and its boxes must not move by one bit.
      // Passes before #1896 too: it pins the output the fix leaves alone.
      // It does not pin WHICH branch produced it — the vertex walk lands on
      // the same doubles for these matrices (checked by forcing it).
      const quarterTurnAndMirror = new Matrix4().set(
        0, -1, 0, 3,
        -1, 0, 0, -4,
        0, 0, ODD_OFFSET, 7,
        0, 0, 0, 1)
      const placements = [
        new Matrix4().makeTranslation(ODD_OFFSET, -ODD_SCALE, FAR),
        new Matrix4().makeScale(ODD_SCALE, ODD_OFFSET, -ODD_SCALE).setPosition(FAR, 7, -ODD_OFFSET),
        quarterTurnAndMirror,
      ]
      for (const placement of placements) {
        const {root, mesh} = oneInstance(turnedBeam(), placement)
        const result = computeRobustBounds(root)
        const reference = placedLocalBox(mesh)
        expect(result.exactBox.min.toArray()).toEqual(reference.min.toArray())
        expect(result.exactBox.max.toArray()).toEqual(reference.max.toArray())
      }
    })
  })

  describe('robustBoundsFromElements (streaming follow)', () => {
    /**
     * @param {number} count unit boxes along x, spread over MODEL_SIZE
     * @param {Array<Array<number>>} [strayCenters]
     * @return {ElementBoxes}
     */
    function streamedBoxes(count, strayCenters = []) {
      const store = new ElementBoxes()
      const box = new Box3()
      const size = new Vector3(1, 1, 1)
      for (let i = 0; i < count; i++) {
        store.push(box.setFromCenterAndSize(
          new Vector3((i / count) * MODEL_SIZE, 0, 0), size))
      }
      for (const [x, y, z] of strayCenters) {
        store.push(box.setFromCenterAndSize(new Vector3(x, y, z), size))
      }
      return store
    }

    it('agrees with the Object3D path on the same geometry', () => {
      // The follow and the end-of-load fit must not disagree, or the
      // camera visibly corrects itself when the load settles.
      const root = new Object3D()
      root.add(batchedCubes(CUBE_COUNT, [[0, STRAY_DISTANCE, STRAY_DISTANCE]]))
      const fromObject = computeRobustBounds(root)
      const fromElements = robustBoundsFromElements(
        [streamedBoxes(CUBE_COUNT, [[0, STRAY_DISTANCE, STRAY_DISTANCE]])])

      expect(fromElements.excludedElements).toBe(fromObject.excludedElements)
      expect(fromElements.box.max.y).toBeCloseTo(fromObject.box.max.y)
    })

    it('classifies across several stores as one model', () => {
      // The session keeps preview-group and streamed-instance boxes
      // apart (different lifetimes) but they are one model to frame.
      const half = CUBE_COUNT / 2
      const result = robustBoundsFromElements([
        streamedBoxes(half),
        streamedBoxes(half, [[0, 0, STRAY_DISTANCE]]),
      ])

      expect(result.totalElements).toBe(CUBE_COUNT + 1)
      expect(result.excludedElements).toBe(1)
      expect(result.box.max.z).toBeLessThanOrEqual(1)
    })

    it('leaves a small model alone, so the follow and the final fit agree', () => {
      // Under ~50 elements the 2% budget rounds below one, and there is
      // deliberately no absolute floor: a floor would both let a small
      // model lose 9% of itself and — since this core is shared — let
      // the streaming follow exclude what the final fit would keep,
      // which is a visible pop when the load settles.
      const smallCount = 40
      const result = robustBoundsFromElements(
        [streamedBoxes(smallCount, [[0, 0, STRAY_DISTANCE]])])

      expect(result.excludedElements).toBe(0)
      expect(result.box.max.z).toBeCloseTo(STRAY_DISTANCE + UNIT_HALF_EXTENT)
    })

    it('returns null with nothing recorded', () => {
      expect(robustBoundsFromElements([new ElementBoxes()])).toBeNull()
    })

    it('grows past its initial capacity without losing boxes', () => {
      const store = new ElementBoxes(2)
      const grown = 200
      const box = new Box3()
      for (let i = 0; i < grown; i++) {
        box.setFromCenterAndSize(new Vector3(i, 0, 0), new Vector3(1, 1, 1))
        store.push(box)
      }
      const result = robustBoundsFromElements([store])

      // Last box's center, plus its half-extent.
      expect(result.totalElements).toBe(grown)
      expect(result.box.max.x).toBeCloseTo((grown - 1) + UNIT_HALF_EXTENT)
    })
  })

  describe('robustBoundsFor cache', () => {
    it('returns the same result object while the model is unchanged', () => {
      const root = new Object3D()
      root.add(mergedMesh(CLUSTER_COUNT))
      const first = robustBoundsFor(root)
      expect(robustBoundsFor(root)).toBe(first)
    })

    it('recomputes when geometry is added', () => {
      const root = new Object3D()
      root.add(mergedMesh(CLUSTER_COUNT))
      const first = robustBoundsFor(root)
      root.add(mergedMesh(TEN_MORE_CLUSTERS))
      const second = robustBoundsFor(root)
      expect(second).not.toBe(first)
      expect(second.totalVertices).toBeGreaterThan(first.totalVertices)
    })
  })
})
