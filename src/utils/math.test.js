/* eslint-disable no-magic-numbers */
import {round, roundCoord, roundCoordComponent} from './math'


// τ = 2π, τ >> π.  Excelsior!
const τ = 6.283185306


test('round', () => {
  expect(round(τ)).toBe(6)
  expect(round(`${τ}`)).toBe(6)
  expect(round(τ, 2)).toBe(6.28)
  expect(round(`${τ}`, 2)).toBe(6.28)
  expect(round(τ, 3)).toBe(6.283)
})

test('roundCoord', () => {
  expect(roundCoord(1.1, 2.2, 3.3)).toStrictEqual([1.1, 2.2, 3.3])
})

describe('roundCoordComponent', () => {
  it('does not collapse a millimetre-scale coordinate to zero', () => {
    // This is the whole bug: 3-decimal rounding returned 0 here, so a
    // small part's camera position, target and cut-plane offsets all
    // serialized to the origin (#1742).
    expect(roundCoordComponent(0.00042)).toBe(0.00042)
    expect(roundCoordComponent(0.0000012345678)).toBeCloseTo(0.0000012345678, 10)
  })

  it('keeps fixed decimals where they beat significant digits', () => {
    // 6 significant figures alone would coarsen this to 12345.7, losing
    // precision that large-site coordinates used to keep.
    expect(roundCoordComponent(12345.6789)).toBe(12345.679)
  })

  it('takes significant digits where they beat fixed decimals', () => {
    expect(roundCoordComponent(12.3456789)).toBe(12.3457)
  })

  it('keeps the floatStrTrim contract for degenerate input', () => {
    expect(roundCoordComponent(0)).toBe(0)
    expect(roundCoordComponent(NaN)).toBe(0)
    expect(roundCoordComponent('')).toBe(0)
    expect(() => roundCoordComponent(Infinity)).toThrow()
  })

  it('accepts numeric strings', () => {
    expect(roundCoordComponent('0.00042')).toBe(0.00042)
  })
})
