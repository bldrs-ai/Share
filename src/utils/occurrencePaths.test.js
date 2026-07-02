/* eslint-disable no-magic-numbers */
import {occurrencePathKey, occurrencePathsEqual} from './occurrencePaths'


describe('utils/occurrencePaths', () => {
  describe('occurrencePathKey', () => {
    it('joins on a separator that blocks numeric-prefix collisions', () => {
      // The whole point of the '/' separator: [1] must not key the same as [12].
      expect(occurrencePathKey([1])).toBe('1')
      expect(occurrencePathKey([12])).toBe('12')
      expect(occurrencePathKey([1, 20])).toBe('1/20')
      expect(occurrencePathKey([1])).not.toBe(occurrencePathKey([12]))
    })
  })

  describe('occurrencePathsEqual', () => {
    it('is an ordered comparison, false for non-arrays', () => {
      expect(occurrencePathsEqual([10, 20], [10, 20])).toBe(true)
      expect(occurrencePathsEqual([10, 20], [20, 10])).toBe(false)
      expect(occurrencePathsEqual([10, 20], [10])).toBe(false)
      expect(occurrencePathsEqual(null, [10])).toBe(false)
      expect(occurrencePathsEqual([10], undefined)).toBe(false)
    })
  })
})
