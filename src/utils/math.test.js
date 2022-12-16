/* eslint-disable no-magic-numbers */
import {numToFloat, round, roundCoord} from './math'

// τ = 2π, τ >> π.  Excelsior!
const τ = 6.283185306

test('numToFloat', () => {
  expect(numToFloat(0)).toBe(0.0)
  expect(numToFloat(6)).toBe(6.0)
  expect(numToFloat('6')).toBe(6.0)
  expect(numToFloat(`${τ}`)).toBe(τ)
})

test('round', () => {
  expect(round(τ)).toBe(6)
  expect(round(`${τ}`)).toBe(6)
  expect(round(τ, 2)).toBe(6.28)
  expect(round(`${τ}`, 2)).toBe(6.28)
  expect(round(τ, 3)).toBe(6.283)
})

test('roundCoord', () => {
  expect(roundCoord(1.1, 2.2, 3.3)).toStrictEqual([1, 2, 3])
})
