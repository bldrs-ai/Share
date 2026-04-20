import {renderHook} from '@testing-library/react'
import useExistInFeature from './useExistInFeature'


jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useSearchParams: () => [new URLSearchParams()],
}))


describe('useExistInFeature — static FeatureFlags', () => {
  it('returns true for googleOAuth2 from static flags', () => {
    const {result} = renderHook(() => useExistInFeature('googleOAuth2'))
    expect(result.current).toBeTruthy()
  })

  it('returns true for googleDrive from static flags', () => {
    const {result} = renderHook(() => useExistInFeature('googleDrive'))
    expect(result.current).toBeTruthy()
  })

  it('returns false for a flag not in static flags or URL', () => {
    const {result} = renderHook(() => useExistInFeature('unknownFeature'))
    expect(result.current).toBeFalsy()
  })
})
