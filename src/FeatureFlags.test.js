import {flags, isFeatureEnabled} from './FeatureFlags'


describe('FeatureFlags', () => {
  // Mutating window.location.search via assignment is allowed in jsdom but
  // varies between versions; resetting it after each test keeps tests isolated.
  let originalSearch
  beforeEach(() => {
    originalSearch = window.location.search
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {...window.location, search: ''},
    })
  })
  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {...window.location, search: originalSearch},
    })
  })

  it('declares glb and glbDraco flags, both inactive by default', () => {
    const glb = flags.find((f) => f.name === 'glb')
    const glbDraco = flags.find((f) => f.name === 'glbDraco')
    expect(glb).toBeDefined()
    expect(glb.isActive).toBe(false)
    expect(glbDraco).toBeDefined()
    expect(glbDraco.isActive).toBe(false)
  })

  describe('isFeatureEnabled', () => {
    it('returns false for unknown name', () => {
      expect(isFeatureEnabled('not-a-flag')).toBe(false)
    })

    it('returns false for empty/undefined name', () => {
      expect(isFeatureEnabled('')).toBe(false)
      expect(isFeatureEnabled(undefined)).toBe(false)
    })

    it('honors a static isActive: true flag without needing URL params', () => {
      // googleOAuth2 ships with isActive: true.
      expect(isFeatureEnabled('googleOAuth2')).toBe(true)
    })

    it('returns false for an isActive: false flag when URL has no feature param', () => {
      expect(isFeatureEnabled('glb')).toBe(false)
      expect(isFeatureEnabled('glbDraco')).toBe(false)
    })

    it('enables a flag listed in ?feature=', () => {
      window.location.search = '?feature=glb'
      expect(isFeatureEnabled('glb')).toBe(true)
      expect(isFeatureEnabled('glbDraco')).toBe(false)
    })

    it('enables multiple flags via comma-separated ?feature=', () => {
      window.location.search = '?feature=glb,glbDraco'
      expect(isFeatureEnabled('glb')).toBe(true)
      expect(isFeatureEnabled('glbDraco')).toBe(true)
    })

    it('is case-insensitive on both flag name and URL value', () => {
      window.location.search = '?feature=GLB,GlbDraco'
      expect(isFeatureEnabled('glb')).toBe(true)
      expect(isFeatureEnabled('GLBDRACO')).toBe(true)
    })

    it('trims whitespace around comma-separated values', () => {
      window.location.search = '?feature= glb , glbDraco '
      expect(isFeatureEnabled('glb')).toBe(true)
      expect(isFeatureEnabled('glbDraco')).toBe(true)
    })

    it('ignores unrelated query params', () => {
      window.location.search = '?other=x&feature=glb&foo=bar'
      expect(isFeatureEnabled('glb')).toBe(true)
    })
  })
})
