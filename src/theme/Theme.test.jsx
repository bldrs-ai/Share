import {act, renderHook} from '@testing-library/react'
import useShareTheme, {Themes, getSystemCurrentLightDark} from './Theme'


describe('Theme', () => {
  // https://stackoverflow.com/questions/41885841/how-can-i-mock-the-javascript-window-object-using-jest
  let windowSpy

  beforeEach(() => {
    windowSpy = jest.spyOn(window, 'window', 'get')
  })

  afterEach(() => {
    windowSpy.mockRestore()
  })

  describe('getSystemCurrentLightDark', () => {
    test('returns day when system is light', () => {
      windowSpy.mockImplementation(() => ({
        matchMedia: jest.fn((query) => {
          return {matches: query !== '(prefers-color-scheme: dark)'}
        }),
      }))
      expect(getSystemCurrentLightDark()).toBe(Themes.Day)
    })

    test('returns night when system is dark', () => {
      windowSpy.mockImplementation(() => ({
        matchMedia: jest.fn((query) => {
          return {matches: query === '(prefers-color-scheme: dark)'}
        }),
      }))
      expect(getSystemCurrentLightDark()).toBe(Themes.Night)
    })

    test('returns day when matchMedia is not supported', () => {
      windowSpy.mockImplementation(() => ({
        matchMedia: null,
      }))
      expect(getSystemCurrentLightDark()).toBe(Themes.Day)
    })
  })

  describe('Themes constant', () => {
    test('includes all expected theme options', () => {
      expect(Themes.Day).toBe('Day')
      expect(Themes.Night).toBe('Night')
      expect(Themes.System).toBe('System')
    })

    test('has three distinct theme options', () => {
      const themeValues = Object.values(Themes)
      expect(themeValues).toHaveLength(3)
      expect(new Set(themeValues).size).toBe(3)
    })
  })

  describe('Theme integration', () => {
    test('System theme defaults to system preference when available', () => {
      windowSpy.mockImplementation(() => ({
        matchMedia: jest.fn((query) => {
          return {matches: query === '(prefers-color-scheme: dark)'}
        }),
      }))

      // When system preference is dark, getSystemCurrentLightDark should return Night
      expect(getSystemCurrentLightDark()).toBe(Themes.Night)

      // When system preference is light
      windowSpy.mockImplementation(() => ({
        matchMedia: jest.fn((query) => {
          return {matches: query !== '(prefers-color-scheme: dark)'}
        }),
      }))
      expect(getSystemCurrentLightDark()).toBe(Themes.Day)
    })

    test('handles edge case when window.matchMedia returns null', () => {
      windowSpy.mockImplementation(() => ({
        matchMedia: jest.fn(() => null),
      }))

      // Should throw because we're trying to access .matches on null
      expect(() => getSystemCurrentLightDark()).toThrow()
    })

    test('handles edge case when window has no matchMedia', () => {
      windowSpy.mockImplementation(() => ({
        matchMedia: undefined,
      }))

      // Should not throw and should default to Day when matchMedia is undefined
      expect(() => getSystemCurrentLightDark()).not.toThrow()
      expect(getSystemCurrentLightDark()).toBe(Themes.Day)
    })
  })

  describe('useShareTheme listener firing', () => {
    // Regression: CadView.onModelPath both calls its initViewerCb directly
    // AND registers it as a theme listener. If useShareTheme fires listeners
    // on initial mount, that's two viewer inits per model load — the Safari
    // double-load symptom on Plaza/Momentum/index.ifc. The listener should
    // only fire on actual theme transitions, not on the first commit.

    test('does not fire registered listeners on initial mount', () => {
      const listener = jest.fn()
      const {result} = renderHook(() => useShareTheme())
      act(() => {
        result.current.addThemeChangeListener(listener)
      })
      expect(listener).not.toHaveBeenCalled()
    })

    test('fires listeners on subsequent theme changes', () => {
      const listener = jest.fn()
      const {result} = renderHook(() => useShareTheme())
      act(() => {
        result.current.addThemeChangeListener(listener)
      })
      act(() => {
        result.current.setTheme(Themes.Night)
      })
      expect(listener).toHaveBeenCalledTimes(1)
    })

    test('does not refire listeners on re-render without a theme change', () => {
      const listener = jest.fn()
      const {result, rerender} = renderHook(() => useShareTheme())
      act(() => {
        result.current.addThemeChangeListener(listener)
      })
      rerender()
      rerender()
      expect(listener).not.toHaveBeenCalled()
    })
  })
})
