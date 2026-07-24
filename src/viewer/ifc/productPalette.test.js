/* eslint-disable no-magic-numbers */
import {
  PRODUCT_PALETTE,
  applyProductPalette,
  hashKey,
  isDefaultColor,
  productPaletteRgb,
} from './productPalette'
import {DEFAULT_COLOR} from './flatMeshToBatchedModel'


const grey = () => ({x: DEFAULT_COLOR.x, y: DEFAULT_COLOR.y, z: DEFAULT_COLOR.z, w: 1})


/**
 * Minimal batch double: records every setColorAt so a test can assert the
 * live color buffer was repainted, not just the restore table.
 *
 * @param {Array<object>} instanceColors
 * @param {Array<number>} instanceParents per-occurrence product ids
 * @param {Array<number>} [instanceGeometryIds] per-part geometry ids (the
 *   preferred coloring key); omit to exercise the parent-id fallback
 * @return {object} batch with a recording `mesh.setColorAt`
 */
function fakeBatch(instanceColors, instanceParents, instanceGeometryIds) {
  const painted = new Map()
  return {
    instanceColors,
    instanceParents,
    instanceGeometryIds,
    painted,
    mesh: {
      setColorAt(i, v) {
        painted.set(i, {x: v.x, y: v.y, z: v.z, w: v.w})
      },
    },
  }
}


describe('hashKey', () => {
  it('is deterministic and stable across string/number forms of a key', () => {
    expect(hashKey(42)).toBe(hashKey(42))
    expect(hashKey(42)).toBe(hashKey('42'))
  })

  it('returns an unsigned 32-bit integer', () => {
    for (const key of [0, 1, 999999, 'FRONTFAN', '']) {
      const h = hashKey(key)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(0xffffffff)
    }
  })

  it('spreads distinct keys (no collision across a small product set)', () => {
    const slots = new Set()
    for (let id = 1; id <= PRODUCT_PALETTE.length; id++) {
      slots.add(hashKey(id) % PRODUCT_PALETTE.length)
    }
    // Not a guarantee in general, but these small ids must not all collide.
    expect(slots.size).toBeGreaterThan(1)
  })
})


describe('productPaletteRgb', () => {
  it('is deterministic per key', () => {
    expect(productPaletteRgb(7)).toBe(productPaletteRgb(7))
  })

  it('only ever returns palette members', () => {
    for (let id = 0; id < 100; id++) {
      expect(PRODUCT_PALETTE).toContain(productPaletteRgb(id))
    }
  })

  it('no palette entry is the fallback grey', () => {
    for (const c of PRODUCT_PALETTE) {
      expect(isDefaultColor(c)).toBe(false)
    }
  })
})


describe('isDefaultColor', () => {
  it('accepts the exact fallback grey and tiny float noise', () => {
    expect(isDefaultColor(grey())).toBe(true)
    expect(isDefaultColor({x: 0.805, y: 0.795, z: 0.8})).toBe(true)
  })

  it('rejects authored colors, alpha-independent', () => {
    expect(isDefaultColor({x: 0.6, y: 0.576, z: 0.749})).toBe(false)
    expect(isDefaultColor({x: 1, y: 0.5, z: 0})).toBe(false)
    // Same grey RGB but translucent is still "unstyled" — alpha ignored.
    expect(isDefaultColor({x: 0.8, y: 0.8, z: 0.8, w: 0.3})).toBe(true)
  })
})


describe('applyProductPalette', () => {
  it('colors by geometry (part), so instances of one part share a color', () => {
    // Two parts: geometry 500 instanced 3x (each its own occurrence id),
    // geometry 600 once. The blades case: same part -> same color.
    const colors = [grey(), grey(), grey(), grey()]
    const parents = [11, 12, 13, 20] // all distinct occurrences
    const geometryIds = [500, 500, 500, 600]
    const batch = fakeBatch(colors, parents, geometryIds)

    expect(applyProductPalette([batch])).toBe(true)
    // The three instances of geometry 500 are identically colored...
    expect(colors[0]).toEqual(colors[1])
    expect(colors[1]).toEqual(colors[2])
    // ...and geometry 600 is a different part -> different color.
    expect(colors[3]).not.toEqual(colors[0])
  })

  it('falls back to the product/occurrence id when no geometry table', () => {
    const colors = [grey(), grey(), grey()]
    const parents = [10, 20, 10]
    const batch = fakeBatch(colors, parents) // no instanceGeometryIds

    expect(applyProductPalette([batch])).toBe(true)

    // Restore table now carries palette colors, no longer grey.
    for (const c of colors) {
      expect(isDefaultColor(c)).toBe(false)
    }
    // Live buffer got the same colors (setColorAt called per instance).
    expect(batch.painted.size).toBe(3)
    for (let i = 0; i < 3; i++) {
      expect(batch.painted.get(i)).toEqual(colors[i])
    }
    // Same product -> same color; different product -> (here) different.
    expect(colors[0]).toEqual(colors[2])
    expect(colors[0]).not.toEqual(colors[1])
  })

  it('keys by product across batches (opaque + transparent split)', () => {
    // Product 10 appears in both batches; product 20 only in the opaque one,
    // so the model has two distinct products and the palette fires.
    const opaque = fakeBatch([grey(), grey()], [10, 20])
    const transparent = fakeBatch([grey()], [10])
    expect(applyProductPalette([opaque, transparent])).toBe(true)
    // Product 10 gets one deterministic color in either batch.
    expect(opaque.instanceColors[0]).toEqual(transparent.instanceColors[0])
    // Product 20 is a different product -> a different color.
    expect(opaque.instanceColors[1]).not.toEqual(opaque.instanceColors[0])
  })

  it('preserves per-instance alpha', () => {
    const colors = [{x: 0.8, y: 0.8, z: 0.8, w: 0.25}, grey()]
    const batch = fakeBatch(colors, [1, 2])
    expect(applyProductPalette([batch])).toBe(true)
    expect(colors[0].w).toBe(0.25)
    expect(colors[1].w).toBe(1)
  })

  it('is a no-op when any real color is present (mixed model honored)', () => {
    const colors = [grey(), {x: 1, y: 0.5, z: 0}]
    const parents = [1, 2]
    const batch = fakeBatch(colors, parents)
    expect(applyProductPalette([batch])).toBe(false)
    // Grey sibling stays grey — presentation intent honored.
    expect(isDefaultColor(colors[0])).toBe(true)
    expect(batch.painted.size).toBe(0)
  })

  it('is a no-op for a single-product colorless model', () => {
    const batch = fakeBatch([grey(), grey()], [7, 7])
    expect(applyProductPalette([batch])).toBe(false)
    expect(batch.painted.size).toBe(0)
  })

  it('bails when a batch lacks color/parent tables', () => {
    const noop = () => {/* recording not needed: this batch must be rejected */}
    const batch = {instanceColors: null, instanceParents: null, mesh: {setColorAt: noop}}
    expect(applyProductPalette([batch])).toBe(false)
  })
})
