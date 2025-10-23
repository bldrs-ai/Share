import {renderHook} from '@testing-library/react'
import {useExistInFeature} from './useExistInFeature'


jest.mock('react-router-dom', () => {
  return {
    ...jest.requireActual('react-router-dom'),
    useSearchParams: () => [new URLSearchParams({feature: 'app,placemark,googleOAuth2'})],
  }
})


describe('useExistInFeature', () => {
  it('check for the existence of a named feature in the URL SearchParams', () => {
    const appHook = renderHook(() => useExistInFeature('app'))
    expect(appHook.result.current).toBeTruthy()
    const placeMarkHook = renderHook(() => useExistInFeature('placemark'))
    expect(placeMarkHook.result.current).toBeTruthy()
    const googleEnabled = renderHook(() => useExistInFeature('googleOAuth2'))
    expect(googleEnabled.result.current).toBeTruthy()
    // Bogus feature should be false
    const exceptHook = renderHook(() => useExistInFeature('except'))
    expect(exceptHook.result.current).toBeFalsy()
  })
})
