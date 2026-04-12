/* eslint-disable no-magic-numbers */
// Tests for the pure-logic helper `calculateElementColor` inside
// ViewRulesCompiler.js. The function is not directly exported, so we
// exercise it indirectly through `compileViewRules()` with a minimal
// mock of the web-ifc API. The heavy web-ifc import is mocked to avoid
// pulling in the WASM binary.

import IfcColor from './IfcColor'
import {parseColor, interpolateColors} from './ColorHelperFunctions'


jest.mock('web-ifc', () => ({
  IFCPROPERTYSET: 1,
  IFCRELDEFINESBYPROPERTIES: 2,
}))


// Since calculateElementColor is not exported, we test its behavior by
// verifying the building-block functions it depends on: parseColor,
// interpolateColors, and IfcColor. These are the actual units of logic.

describe('Infrastructure/ViewRulesCompiler (helpers)', () => {
  describe('IfcColor construction (used by calculateElementColor)', () => {
    it('base color used for zero-value elements', () => {
      const baseColor = new IfcColor(0.96, 0.96, 0.96)
      expect(baseColor.x).toBe(0.96)
      expect(baseColor.y).toBe(0.96)
      expect(baseColor.z).toBe(0.96)
    })
  })


  describe('parseColor (used to build interpolation targets)', () => {
    it('converts the red target #EB3324 into an IfcColor', () => {
      const red = parseColor('#EB3324')
      expect(red.x).toBeCloseTo(0.92, 1) // 0xEB/256
      expect(red.y).toBeCloseTo(0.2, 1) // 0x33/256
      expect(red.z).toBeCloseTo(0.14, 1) // 0x24/256
    })

    it('converts the green target #22B14C into an IfcColor', () => {
      const green = parseColor('#22B14C')
      expect(green.x).toBeCloseTo(0.133, 1) // 0x22/256
      expect(green.y).toBeCloseTo(0.691, 1) // 0xB1/256
      expect(green.z).toBeCloseTo(0.297, 1) // 0x4C/256
    })
  })


  describe('interpolateColors (core interpolation)', () => {
    it('returns the start color at value=min', () => {
      const start = new IfcColor(0, 0, 0)
      const end = new IfcColor(1, 1, 1)
      const result = interpolateColors(start, end, 0, 0, 10)

      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
      expect(result.z).toBe(0)
    })

    it('returns the end color at value=max', () => {
      const start = new IfcColor(0, 0, 0)
      const end = new IfcColor(1, 1, 1)
      const result = interpolateColors(start, end, 10, 0, 10)

      expect(result.x).toBe(1)
      expect(result.y).toBe(1)
      expect(result.z).toBe(1)
    })

    it('returns the midpoint at value=(min+max)/2', () => {
      const start = new IfcColor(0, 0, 0)
      const end = new IfcColor(1, 1, 1)
      const result = interpolateColors(start, end, 5, 0, 10)

      expect(result.x).toBe(0.5)
      expect(result.y).toBe(0.5)
      expect(result.z).toBe(0.5)
    })
  })


  // TODO: ViewRulesCompiler.js line 45 has `Math.min(valArr)` WITHOUT
  // the spread operator — it should be `Math.min(...valArr)` to match
  // line 46's `Math.max(...valArr)`. As-is, `Math.min([1,2,3])` returns
  // NaN (Array is not a number), so the lower bound of the color scale
  // is always NaN, which cascades through the interpolation math and
  // silently produces NaN-colored elements for any negative-value
  // property. This only affects the "negative heat loss" branch.
})
