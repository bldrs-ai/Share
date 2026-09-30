// The SHIPPED defaults, read through the real FeatureFlags (glbCompress.test.js
// mocks isFeatureEnabled, so it pins the logic but cannot notice a flag
// flipping in FeatureFlags.js). `glbCollapse` went default-on in share-140
// #1871; these fail if it is flipped back, or if `disableGlbCollapse` stops
// being the way out.
import {
  BLDRS_GLB_BATCHED_SCHEMA_VERSION,
  BLDRS_GLB_COLLAPSED_SCHEMA_VERSION,
} from './glbCacheKey'
import {activeArtifactSpec, isGlbCollapseActive} from './glbCompress'


describe('loader/glbCompress shipped defaults (real FeatureFlags)', () => {
  const originalLocation = window.location

  /** @param {string} search the query string the session "loaded" with */
  function setSearch(search) {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {...originalLocation, search},
    })
  }

  afterEach(() => {
    Object.defineProperty(window, 'location', {writable: true, value: originalLocation})
  })

  it('reads and writes the COLLAPSED slot with no feature params at all', () => {
    setSearch('')
    expect(isGlbCollapseActive()).toBe(true)
    expect(activeArtifactSpec())
      .toEqual({schemaVer: BLDRS_GLB_COLLAPSED_SCHEMA_VERSION, mode: null})
  })

  it('?feature=disableGlbCollapse falls back to the batched slot', () => {
    setSearch('?feature=disableGlbCollapse')
    expect(isGlbCollapseActive()).toBe(false)
    expect(activeArtifactSpec())
      .toEqual({schemaVer: BLDRS_GLB_BATCHED_SCHEMA_VERSION, mode: null})
  })

  it('?feature=glbCollapse is redundant now: same slot as the default', () => {
    setSearch('?feature=glbCollapse')
    expect(activeArtifactSpec().schemaVer).toBe(BLDRS_GLB_COLLAPSED_SCHEMA_VERSION)
  })
})
