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

  /**
   * `file.type` is a browser-supplied MIME string, so collapsing only the
   * size still minted one Sentry issue per MIME — the same explosion
   * SHARE-1EA is about, one level down.
   */
  it('groups one alert family across its per-upload MIME types and sizes', () => {
    trackAlert('File upload of unknown type: type(application/octet-stream) size(180384)')
    trackAlert('File upload of unknown type: type(model/gltf-binary) size(12345)')
    trackAlert('File upload of unknown type: type() size(7)')

    const fingerprints = Sentry.captureException.mock.calls.map(([, ctx]) => ctx.fingerprint)
    expect(fingerprints[0]).toEqual(['alert', 'File upload of unknown type: type(#) size(#)'])
    expect(fingerprints[1]).toEqual(fingerprints[0])
    expect(fingerprints[2]).toEqual(fingerprints[0])
  })

  /**
   * The parenthesized collapse must not over-merge. These are the only two
   * messages reaching this branch that contain parentheses at all, plus a
   * paren-free neighbour — all three have to stay separate issues.
   */
  it('keeps genuinely distinct alert families distinct', () => {
    trackAlert('File upload of unknown type: type(application/octet-stream) size(180384)')
    trackAlert('This model was cached in an older format that this version of Share ' +
      'no longer reads, so element properties are unavailable. ' +
      'Clear the local cache (Profile menu → Clear Local Cache) and reload the model to rebuild it.')
    trackAlert('File upload initiated but found no data')

    const keys = Sentry.captureException.mock.calls.map(([, ctx]) => ctx.fingerprint[1])
    expect(new Set(keys).size).toBe(keys.length)
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
