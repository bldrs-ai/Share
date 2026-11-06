/* eslint-disable no-magic-numbers */
import {BatchedMesh, BufferGeometry, Float32BufferAttribute, MeshBasicMaterial} from 'three'
import {reportBvhDepthCap} from '../../loader/loadProgress'
import {getBVHExtremes} from 'three-mesh-bvh'
import {BVH_MAX_DEPTH, computeQuietBatchedBoundsTree, computeQuietBoundsTree, depthCapExtremes} from './bvhBuild'


jest.mock('../../loader/loadProgress', () => ({reportBvhDepthCap: jest.fn()}))


/**
 * `count` small triangles spread along x, so a shallow cap is reached long
 * before the leaves get down to three-mesh-bvh's 10-triangle leaf size.
 *
 * @param {number} count
 * @return {BufferGeometry}
 */
function triangleStrip(count) {
  const positions = []
  for (let i = 0; i < count; i++) {
    positions.push(i, 0, 0, i + 0.5, 1, 0, i + 1, 0, 0)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geometry
}


describe('viewer/ifc/bvhBuild', () => {
  let warnSpy

  beforeEach(() => {
    jest.clearAllMocks()
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => warnSpy.mockRestore())

  // The warning three-mesh-bvh prints at the cap became the title of the
  // load's Sentry diagnostics (SHARE-1MT); the report gets the leaf size.
  it('records a depth-cap hit with its largest leaf, and warns nothing', () => {
    const geometry = triangleStrip(400)
    const bvh = computeQuietBoundsTree.call(geometry, {maxDepth: 2})
    expect(geometry.boundsTree).toBe(bvh)
    expect(warnSpy).not.toHaveBeenCalled()
    expect(reportBvhDepthCap).toHaveBeenCalledTimes(1)
    const [{trees, maxLeafTriangles, maxDepth}] = reportBvhDepthCap.mock.calls[0]
    expect({trees, maxDepth}).toEqual({trees: 1, maxDepth: 2})
    // Four leaves at depth 2 share 400 triangles, so the largest holds a
    // quarter or more: far past the 10-triangle leaf size.
    expect(maxLeafTriangles).toBeGreaterThanOrEqual(100)
  })

  // A tree can hold both a capped branch and an earlier, unsplittable leaf
  // (identical centroids). Only the capped leaves are what a deeper cap or SAH
  // would split, so only they are measured.
  it('measures only the leaves at the cap, not an earlier unsplittable one', () => {
    const strip = triangleStrip(400)
    const stack = [] // 200 coincident triangles, far from the strip
    for (let i = 0; i < 200; i++) {
      stack.push(-1000, 0, 0, -999.5, 1, 0, -999, 0, 0)
    }
    const positions = [...stack, ...strip.getAttribute('position').array]
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))

    const bvh = computeQuietBoundsTree.call(geometry, {maxDepth: 4})
    // The scenario holds: the tree's largest leaf overall is the stack.
    expect(getBVHExtremes(bvh)[0].primitives.max).toBe(200)
    const [{maxLeafTriangles}] = reportBvhDepthCap.mock.calls[0]
    // Eight leaves at depth 4 share the strip's 400.
    expect(maxLeafTriangles).toBeGreaterThanOrEqual(50)
    expect(maxLeafTriangles).toBeLessThan(200)
  })

  it('records nothing for a tree that stays under the cap', () => {
    computeQuietBoundsTree.call(triangleStrip(400))
    expect(reportBvhDepthCap).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('checks every tree of a batched build', () => {
    const material = new MeshBasicMaterial()
    const mesh = new BatchedMesh(4, 4000, 0, material)
    mesh.addGeometry(triangleStrip(400))
    mesh.addGeometry(triangleStrip(3))
    const trees = computeQuietBatchedBoundsTree.call(mesh, -1, {maxDepth: 2})
    expect(trees).toHaveLength(2)
    expect(warnSpy).not.toHaveBeenCalled()
    expect(reportBvhDepthCap).toHaveBeenCalledTimes(1)
    expect(reportBvhDepthCap.mock.calls[0][0]).toEqual(expect.objectContaining({trees: 1, maxDepth: 2}))
  })

  it('uses three-mesh-bvh\'s own default cap', () => {
    expect(BVH_MAX_DEPTH).toBe(40)
    expect(depthCapExtremes([null, undefined], BVH_MAX_DEPTH)).toBeNull()
  })
})
