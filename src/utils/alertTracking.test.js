import * as Sentry from '@sentry/react'
import {gtagEvent} from '../privacy/analytics'
import {trackAlert} from './alertTracking'


jest.mock('@sentry/react', () => ({captureException: jest.fn()}))
jest.mock('../privacy/analytics', () => ({gtagEvent: jest.fn()}))


describe('trackAlert', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  /**
   * Every string alert synthesizes its Error on one line of alertTracking, so
   * Sentry's stack-based grouping had no way to tell them apart and filed
   * them all under one issue (SHARE-1EA).
   */
  it('fingerprints a string alert by its message, not by the shared stack', () => {
    trackAlert('Failed to parse model')
    trackAlert('Could not read full model structure.')

    const [firstContext, secondContext] = Sentry.captureException.mock.calls.map(([, ctx]) => ctx)
    expect(firstContext.fingerprint).toEqual(['alert', 'Failed to parse model'])
    expect(secondContext.fingerprint).toEqual(['alert', 'Could not read full model structure.'])
  })

  it('groups one alert family across its per-upload numbers', () => {
    trackAlert('File upload of unknown type: type() size(180384)')
    trackAlert('File upload of unknown type: type() size(12345)')

    const fingerprints = Sentry.captureException.mock.calls.map(([, ctx]) => ctx.fingerprint)
    expect(fingerprints[0]).toEqual(['alert', 'File upload of unknown type: type() size(#)'])
    expect(fingerprints[0]).toEqual(fingerprints[1])
  })

  it('still captures the message as the exception, with its stack', () => {
    trackAlert('Failed to parse model')
    const [error] = Sentry.captureException.mock.calls[0]
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('Failed to parse model')
    expect(error.stack).toEqual(expect.stringContaining('Error: Failed to parse model'))
  })

  /**
   * A real error carries the stack of wherever it was actually thrown, which
   * discriminates better than its text — so it keeps Sentry's default
   * grouping and gets no fingerprint override.
   */
  it('leaves a real error to Sentry default grouping', () => {
    const error = new Error('Load failed: out of memory')
    trackAlert(error.message, error)
    expect(Sentry.captureException).toHaveBeenCalledWith(error)
  })

  it('reports the raw message to analytics, un-normalized', () => {
    trackAlert('File upload of unknown type: type() size(180384)')
    expect(gtagEvent).toHaveBeenCalledWith('alert', {
      message: 'File upload of unknown type: type() size(180384)',
    })
  })
})
