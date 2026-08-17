import {
  ShadingMode,
  activeShadingMode,
  modelSupportsShading,
  setShadingMode,
} from './shadingMode'


/**
 * A BatchedMesh double with one material, carrying the private draw-list
 * invalidation flag three's BatchedMesh keeps (`_visibilityChanged`).
 *
 * @return {object} mesh double
 */
const batchedMesh = () => ({
  isBatchedMesh: true,
  material: {wireframe: false},
  _visibilityChanged: false,
})


/**
 * A merged Mesh double with an array of materials (the cache-hit shape).
 *
 * @return {object} mesh double
 */
const mergedMesh = () => ({
  isMesh: true,
  material: [{wireframe: false}, {wireframe: false}],
})


/**
 * A Group wrapping opaque + transparent batches, with a THREE-like traverse.
 *
 * @return {object} group double
 */
function batchedGroup() {
  const children = [batchedMesh(), batchedMesh()]
  return {
    children,
    traverse(fn) {
      fn(this)
      children.forEach(fn)
    },
  }
}


describe('shadingMode', () => {
  it('sets and reads wireframe on a lone BatchedMesh', () => {
    const mesh = batchedMesh()
    expect(activeShadingMode(mesh)).toBe(ShadingMode.SHADED)
    setShadingMode(mesh, ShadingMode.WIREFRAME)
    expect(mesh.material.wireframe).toBe(true)
    expect(activeShadingMode(mesh)).toBe(ShadingMode.WIREFRAME)
    setShadingMode(mesh, ShadingMode.SHADED)
    expect(mesh.material.wireframe).toBe(false)
    expect(activeShadingMode(mesh)).toBe(ShadingMode.SHADED)
  })

  it('walks every batch of a Group', () => {
    const group = batchedGroup()
    setShadingMode(group, ShadingMode.WIREFRAME)
    for (const child of group.children) {
      expect(child.material.wireframe).toBe(true)
    }
    expect(activeShadingMode(group)).toBe(ShadingMode.WIREFRAME)
  })

  it('handles a merged mesh with an array of materials (cache-hit shape)', () => {
    const mesh = mergedMesh()
    setShadingMode(mesh, ShadingMode.WIREFRAME)
    for (const mat of mesh.material) {
      expect(mat.wireframe).toBe(true)
    }
    expect(activeShadingMode(mesh)).toBe(ShadingMode.WIREFRAME)
  })

  it('invalidates the BatchedMesh draw list on toggle', () => {
    // Regression (Codex review on #1714): three r184 caches the multi-draw
    // start/count arrays and only rebuilds when invalidated (or when
    // per-object culling / sorting force a per-frame rebuild). Wireframe
    // doubles the counts, so a toggle that skips invalidation draws
    // truncated ranges the moment the per-frame rebuild conditions go away.
    const mesh = batchedMesh()
    setShadingMode(mesh, ShadingMode.WIREFRAME)
    expect(mesh._visibilityChanged).toBe(true)
    mesh._visibilityChanged = false
    setShadingMode(mesh, ShadingMode.SHADED)
    expect(mesh._visibilityChanged).toBe(true)
  })

  it('supports shading whenever a material exists, not otherwise', () => {
    expect(modelSupportsShading(batchedMesh())).toBe(true)
    expect(modelSupportsShading(mergedMesh())).toBe(true)
    expect(modelSupportsShading({children: [], traverse: () => undefined})).toBe(false)
    expect(modelSupportsShading(null)).toBe(false)
  })
})
