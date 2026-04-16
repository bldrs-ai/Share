// Characterization tests for SuppressAboutDialogHandler. See
// HideElementsEventHandler.test.js for scope.

import AbstractApiConnection from '../ApiConnection'
import SuppressAboutDialogHandler from './SuppressAboutDialogHandler'


// This handler calls `useStore.getState().setIsAboutDialogSuppressed(...)`
// but no slice actually defines that setter — the call would throw in a
// real composed store. The mock satisfies the interface so the tests can
// still pin current request/response behavior.
// TODO: setIsAboutDialogSuppressed is missing from every store slice (see
// grep in src/store). Either add the setter or delete this handler.
const mockSetIsAboutDialogSuppressed = jest.fn()

jest.mock('../../store/useStore', () => ({
  __esModule: true,
  default: {
    getState: jest.fn(() => ({
      setIsAboutDialogSuppressed: mockSetIsAboutDialogSuppressed,
    })),
  },
}))


describe('WidgetApi/event-handlers/SuppressAboutDialogHandler', () => {
  let apiConnection

  beforeEach(() => {
    mockSetIsAboutDialogSuppressed.mockClear()
    apiConnection = new AbstractApiConnection()
  })


  it('exposes the canonical event name', () => {
    const handler = new SuppressAboutDialogHandler(apiConnection)
    expect(handler.name).toBe('ai.bldrs-share.SuppressAboutDialog')
  })


  it('returns missing-argument when isSuppressed is absent', () => {
    const handler = new SuppressAboutDialogHandler(apiConnection)
    const result = handler.handler({})
    expect(result).toEqual({error: true, reason: 'Missing argument isSuppressed'})
    expect(mockSetIsAboutDialogSuppressed).not.toHaveBeenCalled()
  })


  it('forwards isSuppressed to the store on success', () => {
    const handler = new SuppressAboutDialogHandler(apiConnection)
    const result = handler.handler({isSuppressed: true})
    expect(result).toEqual({error: false})
    expect(mockSetIsAboutDialogSuppressed).toHaveBeenCalledWith(true)
  })


  it('accepts isSuppressed: false as a valid payload', () => {
    const handler = new SuppressAboutDialogHandler(apiConnection)
    const result = handler.handler({isSuppressed: false})
    expect(result).toEqual({error: false})
    expect(mockSetIsAboutDialogSuppressed).toHaveBeenCalledWith(false)
  })
})
