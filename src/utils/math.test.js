/* eslint-disable no-magic-numbers */
import {round, roundCoord} from './math'


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
