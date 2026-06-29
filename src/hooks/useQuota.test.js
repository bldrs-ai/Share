import {renderHook, waitFor} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedOut} from '../__mocks__/authentication'
import {isFeatureEnabled} from '../FeatureFlags'
import useQuota from './useQuota'


// Keep the real `flags` table; only stub the enforcement gate so each test
// drives the flag directly.
jest.mock('../FeatureFlags', () => ({
  ...jest.requireActual('../FeatureFlags'),
  isFeatureEnabled: jest.fn(),
}))


/**
 * The `quotas` feature flag gates enforcement. These cover the gate itself;
 * the per-tier / rolling-window correctness lives in src/quota/quota.test.js.
 */
describe('useQuota — quotas feature flag', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
  })

  it('reports unlimited capacity and makes record() a no-op when the flag is off', async () => {
    isFeatureEnabled.mockReturnValue(false)

    const {result} = renderHook(() => useQuota())

    expect(result.current.hasCapacity).toBe(true)
    expect(result.current.limit).toBe(Infinity)
    expect(result.current.used).toBe(0)

    // A private GitHub path would normally be counted and could be blocked;
    // with the flag off, record() resolves allowed without a server round-trip.
    await expect(result.current.record('/share/v/gh/owner/repo/main/private.ifc'))
      .resolves.toMatchObject({allowed: true})
  })

  it('enforces a finite per-tier limit when the flag is on', async () => {
    isFeatureEnabled.mockReturnValue(true)

    const {result} = renderHook(() => useQuota())

    // Anonymous (logged-out) tier has a finite cap, so the gate is live.
    await waitFor(() => expect(Number.isFinite(result.current.limit)).toBe(true))
  })
})
