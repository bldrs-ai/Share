/* eslint-disable no-magic-numbers */
import IfcColor from './IfcColor'
import IfcCustomViewSettings from './IfcCustomViewSettings'


describe('Infrastructure/IfcCustomViewSettings', () => {
  describe('constructor', () => {
    it('stores the default color and the two id-to-color maps', () => {
      const defaultColor = new IfcColor(1, 0, 0)
      const expressMap = {10: new IfcColor(0, 1, 0)}
      const globalMap = {'gid-a': new IfcColor(0, 0, 1)}

      const settings = new IfcCustomViewSettings(defaultColor, expressMap, globalMap)

      expect(settings.defaultColor).toBe(defaultColor)
      expect(settings.expressIdsToColorMap).toBe(expressMap)
      expect(settings.globalIdsToColorMap).toBe(globalMap)
    })

    it('defaults the id maps to empty objects', () => {
      const settings = new IfcCustomViewSettings(new IfcColor())
      expect(settings.expressIdsToColorMap).toEqual({})
      expect(settings.globalIdsToColorMap).toEqual({})
    })
  })


  describe('getElementColor', () => {
    it('returns the mapped color when the expressId has an entry', () => {
      const green = new IfcColor(0, 1, 0)
      const settings = new IfcCustomViewSettings(
        new IfcColor(1, 0, 0),
        {42: green},
      )

      expect(settings.getElementColor(42)).toBe(green)
    })

    it('falls back to the default color for unmapped express ids', () => {
      const fallback = new IfcColor(0.5, 0.5, 0.5)
      const settings = new IfcCustomViewSettings(fallback, {})

      expect(settings.getElementColor(999)).toBe(fallback)
    })

    it('treats falsy-valued map entries as unmapped (falls back to default)', () => {
      // An entry explicitly set to 0, null, etc. should fall through to
      // the default color because the ternary check is on truthiness.
      const fallback = new IfcColor(1, 1, 1)
      const settings = new IfcCustomViewSettings(fallback, {7: null})

      expect(settings.getElementColor(7)).toBe(fallback)
    })
  })


  describe('normalizeGlobalIdSettings', () => {
    it('is a no-op when globalIdsToColorMap is empty', () => {
      const settings = new IfcCustomViewSettings(
        new IfcColor(),
        {10: new IfcColor(1, 0, 0)},
        {},
      )

      const mockApi = {
        CreateIfcGuidToExpressIdMapping: jest.fn(),
        ifcGuidMap: new Map(),
      }

      settings.normalizeGlobalIdSettings(mockApi, 0)

      // expressIdsToColorMap unchanged; the api mapping was never called.
      expect(mockApi.CreateIfcGuidToExpressIdMapping).not.toHaveBeenCalled()
      expect(settings.expressIdsToColorMap).toEqual({10: new IfcColor(1, 0, 0)})
    })

    it('converts globalId entries to expressId entries using the api guid map', () => {
      const blue = new IfcColor(0, 0, 1)
      const settings = new IfcCustomViewSettings(
        new IfcColor(),
        {}, // no express ids yet
        {'gid-a': blue},
      )

      // Build a mock api whose guid map resolves gid-a → expressId 42.
      const innerMap = new Map([['gid-a', 42]])
      const mockApi = {
        CreateIfcGuidToExpressIdMapping: jest.fn(),
        ifcGuidMap: new Map([[0, innerMap]]),
      }

      settings.normalizeGlobalIdSettings(mockApi, 0)

      expect(mockApi.CreateIfcGuidToExpressIdMapping).toHaveBeenCalledWith(0)
      expect(settings.expressIdsToColorMap[42]).toBe(blue)
      // The guid map entry for the model is cleaned up after normalization.
      expect(mockApi.ifcGuidMap.has(0)).toBe(false)
    })

    it('silently drops globalIds that the api guid map does not resolve', () => {
      const settings = new IfcCustomViewSettings(
        new IfcColor(),
        {},
        {'missing-gid': new IfcColor(1, 1, 1)},
      )

      const mockApi = {
        CreateIfcGuidToExpressIdMapping: jest.fn(),
        ifcGuidMap: new Map([[0, new Map()]]), // empty inner map
      }

      settings.normalizeGlobalIdSettings(mockApi, 0)

      // Nothing was added to expressIdsToColorMap.
      expect(Object.keys(settings.expressIdsToColorMap).length).toBe(0)
    })
  })
})
