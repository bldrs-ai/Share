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

    it('implies glb when glbDraco is in the URL (compression sub-option)', () => {
      // `glbDraco` configures compression for the GLB cache pipeline;
      // it has no effect when the pipeline itself is off. Putting
      // `glbDraco` in the URL without `glb` was a silent footgun —
      // user reports "no GLB writer logs" and the sub-option is dead.
      // Implication: any GLB sub-option turns the parent on too.
      window.location.search = '?feature=glbDraco'
      expect(isFeatureEnabled('glb')).toBe(true)
      expect(isFeatureEnabled('glbDraco')).toBe(true)
      // Doesn't activate sibling sub-options.
      expect(isFeatureEnabled('glbMeshopt')).toBe(false)
    })

    it('implies glb when glbMeshopt is in the URL', () => {
      window.location.search = '?feature=glbMeshopt'
      expect(isFeatureEnabled('glb')).toBe(true)
      expect(isFeatureEnabled('glbMeshopt')).toBe(true)
      expect(isFeatureEnabled('glbDraco')).toBe(false)
    })

    it('implies glb when glbVerbose is in the URL', () => {
      window.location.search = '?feature=glbVerbose'
      expect(isFeatureEnabled('glb')).toBe(true)
      expect(isFeatureEnabled('glbVerbose')).toBe(true)
    })

    it('implication is one-way — glb alone does NOT activate sub-options', () => {
      window.location.search = '?feature=glb'
      expect(isFeatureEnabled('glb')).toBe(true)
      expect(isFeatureEnabled('glbDraco')).toBe(false)
      expect(isFeatureEnabled('glbMeshopt')).toBe(false)
      expect(isFeatureEnabled('glbVerbose')).toBe(false)
    })

    it('implication works with case-insensitive sub-flag names too', () => {
      // The user-typed `?feature=conwayDirectIFC,GLBDRACO` scenario:
      // implication chains through the lowercased comparison.
      window.location.search = '?feature=GLBDRACO'
      expect(isFeatureEnabled('glb')).toBe(true)
      expect(isFeatureEnabled('glbDraco')).toBe(true)
    })

    it('matches a URL value whose case diverges from the flag definition', () => {
      // Regression pin: the conwayDirectIfc flag was defined with the
      // canonical camelCase `conwayDirectIfc`, but URL-bar autocomplete
      // / hand-typing variations like `conwayDirectIFC` (all-caps IFC)
      // are common — and the user-typed form is what ends up in
      // browser autocomplete memory. The static flag lookup +
      // URL-value matching both lowercase before comparing, so any
      // case variant in the URL resolves to the same flag.
      window.location.search = '?feature=conwayDirectIFC'
      expect(isFeatureEnabled('conwayDirectIfc')).toBe(true)
      // And the reverse direction: URL canonical, caller variant.
      window.location.search = '?feature=conwayDirectIfc'
      expect(isFeatureEnabled('CONWAYDIRECTIFC')).toBe(true)
      expect(isFeatureEnabled('conwaydirectifc')).toBe(true)
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
