// Implication regression pin for `useExistInFeature` (the React hook).
// Mirror of `FeatureFlags.test.js#implies glb when glbDraco...` for
// the non-React path. The two implementations are kept in sync by
// hand; this test catches a divergence where one path implies the
// parent and the other doesn't.
//
// Scenario: user puts `?feature=glbDraco` in the URL (a compression
// sub-option for the GLB cache pipeline). Without implication the
// sub-option is dead because the pipeline itself is gated on `glb`.
// With implication, the sub-option turns the parent on too — so the
// pipeline runs and DRACO compression actually applies.
import {renderHook} from '@testing-library/react'
import useExistInFeature from './useExistInFeature'


jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useSearchParams: () => [new URLSearchParams({feature: 'glbDraco'})],
}))


describe('useExistInFeature — implication', () => {
  it('activates glb when only glbDraco is in the URL', () => {
    const {result} = renderHook(() => useExistInFeature('glb'))
    expect(result.current).toBe(true)
  })

  it('still activates glbDraco itself (sub-flag matches directly)', () => {
    const {result} = renderHook(() => useExistInFeature('glbDraco'))
    expect(result.current).toBe(true)
  })

  it('does NOT activate sibling sub-options (glbMeshopt)', () => {
    const {result} = renderHook(() => useExistInFeature('glbMeshopt'))
    expect(result.current).toBe(false)
  })
})
