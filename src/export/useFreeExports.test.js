import {act, renderHook, waitFor} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedIn, mockedUserLoggedOut} from '../__mocks__/authentication'
import useStore from '../store/useStore'
import {fetchFreeExportAllowance} from './exportHistory'
import useFreeExports from './useFreeExports'


// The GET itself is exportHistory.test.js's; here it is the server's answer.
jest.mock('./exportHistory', () => ({fetchFreeExportAllowance: jest.fn()}))


const SUB = 'github|1234567'
const HOUR_MS = 3600000
const MAX_TIMEOUT_MS = 2147483647
const ALLOWANCE = {limit: 2, used: 1, remaining: 1, nextFreeAt: '2026-10-13T12:00:00.000Z'}


// Lets the mocked fetch's promise (and the state update it drives) settle.
const settle = () => act(() => Promise.resolve())


// Advances the fake clock, flushing the promises the timers it fires start.
const advance = (ms) => act(async () => {
  jest.advanceTimersByTime(ms)
  await Promise.resolve()
})


describe('useFreeExports', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseAuth0.mockReturnValue({...mockedUserLoggedIn, getAccessTokenSilently: jest.fn().mockResolvedValue('token')})
    fetchFreeExportAllowance.mockResolvedValue({tier: 'free', freeExports: ALLOWANCE})
    useStore.getState().setAppMetadata({subscriptionStatus: 'free'})
    useStore.getState().setFreeExportAllowance(null)
  })

  it('asks the server for a free user\'s allowance, and returns it', async () => {
    const {result} = renderHook(() => useFreeExports())

    await waitFor(() => expect(result.current).toEqual({sub: SUB, ...ALLOWANCE}))
    expect(fetchFreeExportAllowance).toHaveBeenCalledTimes(1)
    expect(useStore.getState().freeExportAllowance).toEqual({sub: SUB, ...ALLOWANCE})
  })

  it.each(['sharePro', 'shareProPendingReauth'])('asks nothing and shows nothing for %s, which is unlimited', (status) => {
    useStore.getState().setAppMetadata({subscriptionStatus: status})
    useStore.getState().setFreeExportAllowance({sub: SUB, ...ALLOWANCE})

    const {result} = renderHook(() => useFreeExports())

    expect(result.current).toBeNull()
    expect(fetchFreeExportAllowance).not.toHaveBeenCalled()
  })

  it('asks nothing for an anonymous user', () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)

    const {result} = renderHook(() => useFreeExports())

    expect(result.current).toBeNull()
    expect(fetchFreeExportAllowance).not.toHaveBeenCalled()
  })

  it('never shows one account the count another left in the store', () => {
    fetchFreeExportAllowance.mockReturnValue(new Promise(() => {}))
    useStore.getState().setFreeExportAllowance({sub: 'google-oauth2|someone-else', ...ALLOWANCE, remaining: 0})

    const {result} = renderHook(() => useFreeExports())

    expect(result.current).toBeNull()
  })

  it('leaves the count unknown when the server reports none (a stale free tier, say)', async () => {
    fetchFreeExportAllowance.mockResolvedValue({tier: 'paid', freeExports: null})

    const {result} = renderHook(() => useFreeExports())

    await waitFor(() => expect(fetchFreeExportAllowance).toHaveBeenCalled())
    expect(result.current).toBeNull()
    expect(useStore.getState().freeExportAllowance).toBeNull()
  })

  it('drops a cached same-account allowance when the server says the account is paid', async () => {
    useStore.getState().setFreeExportAllowance({sub: SUB, ...ALLOWANCE, used: 2, remaining: 0})
    fetchFreeExportAllowance.mockResolvedValue({tier: 'paid', freeExports: null})

    const {result} = renderHook(() => useFreeExports())

    await waitFor(() => expect(useStore.getState().freeExportAllowance).toBeNull())
    expect(result.current).toBeNull()
  })

  describe('at the limit', () => {
    const NEXT_FREE_AT = '2026-10-13T12:00:00.000Z'
    const AT_LIMIT = {limit: 2, used: 2, remaining: 0, nextFreeAt: NEXT_FREE_AT}

    beforeEach(() => {
      jest.useFakeTimers()
      jest.setSystemTime(new Date('2026-10-13T11:00:00.000Z'))
      fetchFreeExportAllowance.mockResolvedValueOnce({tier: 'free', freeExports: AT_LIMIT})
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('refetches at nextFreeAt, so a tab left open lifts the gate when the window rolls', async () => {
      fetchFreeExportAllowance.mockResolvedValue({tier: 'free', freeExports: {...ALLOWANCE, used: 0, remaining: 2}})
      const {result} = renderHook(() => useFreeExports())
      await settle()
      expect(result.current).toEqual({sub: SUB, ...AT_LIMIT})
      expect(fetchFreeExportAllowance).toHaveBeenCalledTimes(1)

      await advance(HOUR_MS - 1)
      expect(fetchFreeExportAllowance).toHaveBeenCalledTimes(1)

      await advance(1)
      expect(fetchFreeExportAllowance).toHaveBeenCalledTimes(2)
      expect(result.current.remaining).toBe(2)
    })

    it('clamps a nextFreeAt beyond setTimeout\'s 2^31-1 ms ceiling instead of firing at once', async () => {
      jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
      fetchFreeExportAllowance.mockReset()
      fetchFreeExportAllowance.mockResolvedValue({tier: 'free', freeExports: AT_LIMIT})
      renderHook(() => useFreeExports())
      await settle()
      expect(fetchFreeExportAllowance).toHaveBeenCalledTimes(1)

      await advance(MAX_TIMEOUT_MS - 1)
      expect(fetchFreeExportAllowance).toHaveBeenCalledTimes(1)
    })

    it('clears the timer on unmount', async () => {
      const {unmount} = renderHook(() => useFreeExports())
      await settle()
      unmount()

      await advance(2 * HOUR_MS)
      expect(fetchFreeExportAllowance).toHaveBeenCalledTimes(1)
    })
  })
})
