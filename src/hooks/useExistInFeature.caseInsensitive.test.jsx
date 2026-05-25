// Case-insensitivity regression pin. The flag definitions in
// `FeatureFlags.js` use canonical camelCase (e.g. `conwayDirectIfc`),
// but URL-bar autocomplete / hand-typed variations like
// `conwayDirectIFC` (all-caps IFC) are common — that variant ends up
// in browser autocomplete memory and the next visit reuses it. Both
// the static-flag lookup and the URL-value matching lowercase before
// comparing; this file pins that property for the React hook.
//
// `useExistInFeature` peer at `FeatureFlags.test.js#case-insensitive`
// covers the same property for the non-React `isFeatureEnabled` path.
import {renderHook} from '@testing-library/react'
import useExistInFeature from './useExistInFeature'


jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  // URL has all-caps IFC; flag definition has the canonical case.
  useSearchParams: () => [new URLSearchParams({feature: 'conwayDirectIFC'})],
}))


describe('useExistInFeature — case insensitivity', () => {
  it('matches URL value `conwayDirectIFC` against flag name `conwayDirectIfc`', () => {
    const {result} = renderHook(() => useExistInFeature('conwayDirectIfc'))
    expect(result.current).toBe(true)
  })

  it('matches the same URL value against an all-lowercase caller name', () => {
    const {result} = renderHook(() => useExistInFeature('conwaydirectifc'))
    expect(result.current).toBe(true)
  })

  it('matches the same URL value against an ALL-CAPS caller name', () => {
    const {result} = renderHook(() => useExistInFeature('CONWAYDIRECTIFC'))
    expect(result.current).toBe(true)
  })
})
