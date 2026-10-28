import {act, renderHook, waitFor} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedIn, mockedUserLoggedOut} from '../__mocks__/authentication'
import useStore from '../store/useStore'
import {fetchModelSlots} from './exportHistory'
import useExportSlots from './useExportSlots'


// The GET itself is exportHistory.test.js's; here it is the server's answer.
jest.mock('./exportHistory', () => ({fetchModelSlots: jest.fn()}))


const SUB = 'github|1234567'
const HOUR_MS = 3600000
const MAX_TIMEOUT_MS = 2147483647
const ALLOWANCE = {limit: 2, used: 1, remaining: 1, nextFreeAt: '2026-10-13T12:00:00.000Z', keys: ['/share/v/p/index.ifc']}


// Lets the mocked fetch's promise (and the state update it drives) settle.
const settle = () => act(() => Promise.resolve())


// Advances the fake clock, flushing the promises the timers it fires start.
const advance = (ms) => act(async () => {
  jest.advanceTimersByTime(ms)
  await Promise.resolve()
})


describe('useExportSlots', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseAuth0.mockReturnValue({...mockedUserLoggedIn, getAccessTokenSilently: jest.fn().mockResolvedValue('token')})
    fetchModelSlots.mockResolvedValue({tier: 'free', modelSlots: ALLOWANCE})
    useStore.getState().setAppMetadata({subscriptionStatus: 'free'})
    useStore.getState().setModelSlots(null)
  })

  it('asks the server for a free user\'s model slots, and returns them', async () => {
    const {result} = renderHook(() => useExportSlots())

    await waitFor(() => expect(result.current).toEqual({sub: SUB, ...ALLOWANCE}))
    expect(fetchModelSlots).toHaveBeenCalledTimes(1)
    expect(useStore.getState().modelSlots).toEqual({sub: SUB, ...ALLOWANCE})
  })

  it.each(['sharePro', 'shareProPendingReauth'])('asks nothing and shows nothing for %s, which is unlimited', (status) => {
    useStore.getState().setAppMetadata({subscriptionStatus: status})
    useStore.getState().setModelSlots({sub: SUB, ...ALLOWANCE})

    const {result} = renderHook(() => useExportSlots())

    expect(result.current).toBeNull()
    expect(fetchModelSlots).not.toHaveBeenCalled()
  })

  it('asks nothing for an anonymous user', () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)

    const {result} = renderHook(() => useExportSlots())

    expect(result.current).toBeNull()
    expect(fetchModelSlots).not.toHaveBeenCalled()
  })

  it('never shows one account the slots another left in the store', () => {
    fetchModelSlots.mockReturnValue(new Promise(() => {}))
    useStore.getState().setModelSlots({sub: 'google-oauth2|someone-else', ...ALLOWANCE, remaining: 0})

    const {result} = renderHook(() => useExportSlots())

    expect(result.current).toBeNull()
  })

  it('leaves the slots unknown when the server reports none (a stale free tier, say)', async () => {
    fetchModelSlots.mockResolvedValue({tier: 'paid', modelSlots: null})

    const {result} = renderHook(() => useExportSlots())

    await waitFor(() => expect(fetchModelSlots).toHaveBeenCalled())
    expect(result.current).toBeNull()
    expect(useStore.getState().modelSlots).toBeNull()
  })

  it('drops cached same-account slots when the server says the account is paid', async () => {
    useStore.getState().setModelSlots({sub: SUB, ...ALLOWANCE, used: 2, remaining: 0})
    fetchModelSlots.mockResolvedValue({tier: 'paid', modelSlots: null})

    const {result} = renderHook(() => useExportSlots())

    await waitFor(() => expect(useStore.getState().modelSlots).toBeNull())
    expect(result.current).toBeNull()
  })

  describe('with every slot taken', () => {
    const NEXT_FREE_AT = '2026-10-13T12:00:00.000Z'
    const AT_LIMIT = {limit: 2, used: 2, remaining: 0, nextFreeAt: NEXT_FREE_AT, keys: ['/share/v/p/a.ifc', '/share/v/p/b.ifc']}

    beforeEach(() => {
      jest.useFakeTimers()
      jest.setSystemTime(new Date('2026-10-13T11:00:00.000Z'))
      fetchModelSlots.mockResolvedValueOnce({tier: 'free', modelSlots: AT_LIMIT})
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('refetches at nextFreeAt, so a tab left open lifts the gate when the window rolls', async () => {
      fetchModelSlots.mockResolvedValue({tier: 'free', modelSlots: {...ALLOWANCE, used: 0, remaining: 2}})
      const {result} = renderHook(() => useExportSlots())
      await settle()
      expect(result.current).toEqual({sub: SUB, ...AT_LIMIT})
      expect(fetchModelSlots).toHaveBeenCalledTimes(1)

      await advance(HOUR_MS - 1)
      expect(fetchModelSlots).toHaveBeenCalledTimes(1)

      await advance(1)
      expect(fetchModelSlots).toHaveBeenCalledTimes(2)
      expect(result.current.remaining).toBe(2)
    })

    it('clamps a nextFreeAt beyond setTimeout\'s 2^31-1 ms ceiling instead of firing at once', async () => {
      jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
      fetchModelSlots.mockReset()
      fetchModelSlots.mockResolvedValue({tier: 'free', modelSlots: AT_LIMIT})
      renderHook(() => useExportSlots())
      await settle()
      expect(fetchModelSlots).toHaveBeenCalledTimes(1)

      await advance(MAX_TIMEOUT_MS - 1)
      expect(fetchModelSlots).toHaveBeenCalledTimes(1)
    })

    it('clears the timer on unmount', async () => {
      const {unmount} = renderHook(() => useExportSlots())
      await settle()
      unmount()

      await advance(2 * HOUR_MS)
      expect(fetchModelSlots).toHaveBeenCalledTimes(1)
    })
  })
})
