import {renderHook, waitFor} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedIn, mockedUserLoggedOut} from '../__mocks__/authentication'
import useStore from '../store/useStore'
import {fetchFreeExportAllowance} from './exportHistory'
import useFreeExports from './useFreeExports'


// The GET itself is exportHistory.test.js's; here it is the server's answer.
jest.mock('./exportHistory', () => ({fetchFreeExportAllowance: jest.fn()}))


const SUB = 'github|1234567'
const ALLOWANCE = {limit: 2, used: 1, remaining: 1, nextFreeAt: '2026-10-13T12:00:00.000Z'}


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
})
