/* eslint-disable no-magic-numbers */
import {ColorMode, hasAutoColor, setColorMode} from './colorMode'
import {applyProductPalette, isDefaultColor} from '../ifc/productPalette'
import {DEFAULT_COLOR} from '../ifc/flatMeshToBatchedModel'


const grey = () => ({x: DEFAULT_COLOR.x, y: DEFAULT_COLOR.y, z: DEFAULT_COLOR.z, w: 1})


/**
 * Minimal decorated-BatchedMesh double, in the shape
 * `assembleBatchedModel` stamps: a source snapshot taken before the palette
 * ran, plus the live restore table it repainted.
 *
 * @param {Array<object>} sourceColors the file's own colors
 * @param {Array<number>} instanceParents per-occurrence product ids
 * @param {Array<number>} [instanceGeometryIds] per-part geometry ids
 * @return {object} mesh double with a recording `setColorAt`
 */
function fakeMesh(sourceColors, instanceParents, instanceGeometryIds) {
  const painted = new Map()
  return {
    isBatchedMesh: true,
    instanceSourceColors: sourceColors.map((c) => ({...c})),
    instanceColors: sourceColors.map((c) => ({...c})),
    instanceParents,
    instanceGeometryIds,
    painted,
    userData: {},
    setColorAt(i, v) {
      painted.set(i, {x: v.x, y: v.y, z: v.z, w: v.w})
    },
  }
}


/**
 * A colorless two-part assembly — the case the palette exists for.
 *
 * @return {object} mesh double
 */
const colorlessMesh = () =>
  fakeMesh([grey(), grey(), grey()], [11, 12, 20], [500, 500, 600])


describe('hasAutoColor', () => {
  it('is true for a colorless multi-part model', () => {
    expect(hasAutoColor(colorlessMesh())).toBe(true)
  })

  it('is false when the file carried real color', () => {
    const authored = fakeMesh(
      [{x: 0.6, y: 0.576, z: 0.749, w: 1}, grey()], [11, 12], [500, 600])
    expect(hasAutoColor(authored)).toBe(false)
  })

  it('is false with only one part to tell apart', () => {
    expect(hasAutoColor(fakeMesh([grey(), grey()], [11, 12], [500, 500]))).toBe(false)
  })

  it('is false without a source snapshot to revert to', () => {
    const mesh = colorlessMesh()
    mesh.instanceSourceColors = null
    expect(hasAutoColor(mesh)).toBe(false)
  })
})


describe('setColorMode', () => {
  it('restores the source colors exactly, alpha included', () => {
    const mesh = fakeMesh(
      [grey(), {...grey(), w: 0.3}, grey()], [11, 12, 20], [500, 500, 600])
    const source = mesh.instanceSourceColors.map((c) => ({...c}))

    // Palette first, as load does.
    applyProductPalette([{...mesh, mesh}])
    expect(isDefaultColor(mesh.instanceColors[0])).toBe(false)

    expect(setColorMode(mesh, ColorMode.SOURCE)).toBe(false)
    expect(mesh.instanceColors).toEqual(source)
    // The live buffer, not just the restore table.
    for (let i = 0; i < source.length; i++) {
      expect(mesh.painted.get(i)).toEqual(source[i])
    }
  })

  it('round-trips: auto -> source -> auto lands on the same colors', () => {
    const mesh = colorlessMesh()

    expect(setColorMode(mesh, ColorMode.AUTO)).toBe(true)
    const firstAuto = mesh.instanceColors.map((c) => ({...c}))

    setColorMode(mesh, ColorMode.SOURCE)
    expect(setColorMode(mesh, ColorMode.AUTO)).toBe(true)

    // Recomputing from the source table each time is what makes this hold —
    // recomputing from the displayed table would classify the palette as
    // "real color" and refuse to reapply.
    expect(mesh.instanceColors).toEqual(firstAuto)
  })

  it('leaves the source snapshot immutable across toggles', () => {
    const mesh = colorlessMesh()
    const pristine = mesh.instanceSourceColors.map((c) => ({...c}))

    setColorMode(mesh, ColorMode.AUTO)
    setColorMode(mesh, ColorMode.SOURCE)
    setColorMode(mesh, ColorMode.AUTO)

    expect(mesh.instanceSourceColors).toEqual(pristine)
  })

  it('keeps AUTO a no-op on a model that authored its own colors', () => {
    const authored = fakeMesh(
      [{x: 0.6, y: 0.576, z: 0.749, w: 1}, grey()], [11, 12], [500, 600])
    const source = authored.instanceSourceColors.map((c) => ({...c}))

    expect(setColorMode(authored, ColorMode.AUTO)).toBe(false)
    expect(authored.instanceColors).toEqual(source)
  })

  it('colors by part, so instances of one geometry stay together', () => {
    const mesh = colorlessMesh()
    setColorMode(mesh, ColorMode.AUTO)
    expect(mesh.instanceColors[0]).toEqual(mesh.instanceColors[1])
    expect(mesh.instanceColors[2]).not.toEqual(mesh.instanceColors[0])
  })

  it('does not clobber an active selection highlight', () => {
    const mesh = colorlessMesh()
    // Instance 2 is selected: batchedHighlight state says "paint me cyan",
    // and the base-color rewrite must go under it, not over it.
    mesh.userData.batchedHighlight = {
      selSet: new Set([2]),
      preSet: new Set(),
      selColor: {r: 0, g: 0.8, b: 1},
      preColor: undefined,
      parentIndex: new Map(),
    }

    setColorMode(mesh, ColorMode.AUTO)

    expect(mesh.painted.get(2)).toMatchObject({x: 0, y: 0.8, z: 1})
    // The restore table underneath still took the new base color, so
    // clearing the selection later lands on the palette, not the old grey.
    expect(isDefaultColor(mesh.instanceColors[2])).toBe(false)
  })

  it('is a no-op on a model with no source snapshot', () => {
    const mesh = colorlessMesh()
    mesh.instanceSourceColors = null
    expect(setColorMode(mesh, ColorMode.AUTO)).toBe(false)
    expect(mesh.painted.size).toBe(0)
  })
})
