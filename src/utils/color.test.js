/* eslint-disable no-magic-numbers */
import {hexToRgba} from './color'


describe('utils/color', () => {
  describe('hexToRgba', () => {
    it('converts black', () => {
      expect(hexToRgba('#000000')).toBe('rgba(0, 0, 0)')
    })

    it('converts white', () => {
      expect(hexToRgba('#ffffff')).toBe('rgba(255, 255, 255)')
    })

    it('converts a mixed color without alpha', () => {
      expect(hexToRgba('#1a2b3c')).toBe('rgba(26, 43, 60)')
    })

    it('appends the alpha channel when provided', () => {
      expect(hexToRgba('#1a2b3c', 0.5)).toBe('rgba(26, 43, 60, 0.5)')
    })

    it('treats alpha=0 as provided (not undefined)', () => {
      expect(hexToRgba('#1a2b3c', 0)).toBe('rgba(26, 43, 60, 0)')
    })

    it('accepts uppercase hex digits', () => {
      expect(hexToRgba('#FFAA00')).toBe('rgba(255, 170, 0)')
    })
  })
})
