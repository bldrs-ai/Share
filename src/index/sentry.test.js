import {gtagEvent} from '../privacy/analytics'
import {shouldSendSentryEvent, _resetSentryFilterStateForTests} from './sentry'


jest.mock('../privacy/analytics', () => ({gtagEvent: jest.fn()}))


beforeEach(() => {
  jest.clearAllMocks()
  _resetSentryFilterStateForTests()
})


describe('shouldSendSentryEvent', () => {
  /*
   * SHARE-K3 regression. Netlify's RUM beacon failing under an
   * ad-blocker / carrier proxy produced 21,540 events / 7,118 users
   * of "TypeError: Failed to fetch" with a stack rooted at
   * /.netlify/scripts/rum. The shape below mirrors what Sentry's
   * fetch instrumentation attached.
   */
  it('drops events whose stack is rooted in Netlify RUM', () => {
    const event = {
      exception: {
        values: [{
          type: 'TypeError',
          value: 'Failed to fetch',
          stacktrace: {
            frames: [
              {filename: '/.netlify/scripts/rum'},
              {filename: '/.netlify/scripts/rum'},
            ],
          },
        }],
      },
    }
    expect(shouldSendSentryEvent(event)).toBe(false)
  })

  it('drops events when RUM appears anywhere in the stack, not just on top', () => {
    const event = {
      exception: {
        values: [{
          stacktrace: {
            frames: [
              {filename: 'src/some/first-party.js'},
              {filename: 'https://bldrs.ai/.netlify/scripts/rum'},
              {filename: 'node_modules/@sentry/core/src/utils-hoist/instrument/fetch.ts'},
            ],
          },
        }],
      },
    }
    expect(shouldSendSentryEvent(event)).toBe(false)
  })

  it('keeps events from first-party code', () => {
    const event = {
      exception: {
        values: [{
          type: 'Error',
          value: 'Loader could not read model',
          stacktrace: {
            frames: [
              {filename: 'src/Containers/CadView.jsx'},
              {filename: 'src/loader/Loader.js'},
            ],
          },
        }],
      },
    }
    expect(shouldSendSentryEvent(event)).toBe(true)
  })

  it('keeps events with no stacktrace — no signal to filter on, default to send', () => {
    expect(shouldSendSentryEvent({})).toBe(true)
    expect(shouldSendSentryEvent({exception: {}})).toBe(true)
    expect(shouldSendSentryEvent({exception: {values: []}})).toBe(true)
    expect(shouldSendSentryEvent({exception: {values: [{stacktrace: {frames: []}}]}})).toBe(true)
  })

  it('tolerates frames with no filename', () => {
    const event = {
      exception: {
        values: [{
          stacktrace: {
            frames: [
              {filename: null},
              {filename: undefined},
              {/* missing filename */},
              {filename: 'src/Containers/CadView.jsx'},
            ],
          },
        }],
      },
    }
    expect(shouldSendSentryEvent(event)).toBe(true)
  })

  /*
   * Sentry represents `caused by` chains as additional entries in
   * `exception.values[]`. If the wrapping exception isn't third-party
   * noise but the cause is, we should still drop — the wrapped error
   * doesn't make the noise actionable.
   */
  it('drops events when the cause-chain has a RUM exception even if the top one does not', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Wrapped failure',
            stacktrace: {frames: [{filename: 'src/Containers/CadView.jsx'}]},
          },
          {
            type: 'TypeError',
            value: 'Failed to fetch',
            stacktrace: {frames: [{filename: '/.netlify/scripts/rum'}]},
          },
        ],
      },
    }
    expect(shouldSendSentryEvent(event)).toBe(false)
  })

  it('keeps events when every entry in the cause-chain is first-party', () => {
    const event = {
      exception: {
        values: [
          {stacktrace: {frames: [{filename: 'src/Containers/CadView.jsx'}]}},
          {stacktrace: {frames: [{filename: 'src/loader/Loader.js'}]}},
        ],
      },
    }
    expect(shouldSendSentryEvent(event)).toBe(true)
  })
})


describe('shouldSendSentryEvent — once-per-session GA signal', () => {
  const rumEvent = () => ({
    exception: {
      values: [{
        stacktrace: {
          frames: [{filename: '/.netlify/scripts/rum'}],
        },
      }],
    },
  })

  /*
   * The point of the GA emission isn't to spam — we want one signal
   * per session that "this client blocks RUM", paired with dropping
   * the Sentry events. The first drop fires gtagEvent; subsequent
   * drops for the same pattern must be silent on the GA side too.
   */
  it('fires gtagEvent on the first drop of a third-party-noise event', () => {
    expect(shouldSendSentryEvent(rumEvent())).toBe(false)
    expect(gtagEvent).toHaveBeenCalledTimes(1)
    expect(gtagEvent).toHaveBeenCalledWith('netlify_rum_blocked', {})
  })

  it('does not re-fire gtagEvent on subsequent drops of the same pattern', () => {
    shouldSendSentryEvent(rumEvent())
    shouldSendSentryEvent(rumEvent())
    shouldSendSentryEvent(rumEvent())
    expect(gtagEvent).toHaveBeenCalledTimes(1)
  })

  it('does not fire gtagEvent for first-party events', () => {
    const firstPartyEvent = {
      exception: {
        values: [{
          stacktrace: {
            frames: [{filename: 'src/Containers/CadView.jsx'}],
          },
        }],
      },
    }
    expect(shouldSendSentryEvent(firstPartyEvent)).toBe(true)
    expect(gtagEvent).not.toHaveBeenCalled()
  })

  it('refires gtagEvent after _resetSentryFilterStateForTests — proves test isolation works', () => {
    shouldSendSentryEvent(rumEvent())
    expect(gtagEvent).toHaveBeenCalledTimes(1)
    _resetSentryFilterStateForTests()
    shouldSendSentryEvent(rumEvent())
    expect(gtagEvent).toHaveBeenCalledTimes(2)
  })

  it('still drops Sentry events when gtagEvent throws — best-effort GA capture', () => {
    gtagEvent.mockImplementationOnce(() => {
      throw new Error('gtag blew up')
    })
    expect(shouldSendSentryEvent(rumEvent())).toBe(false)
  })
})


describe('shouldSendSentryEvent — anonymous onerror heuristic (SHARE-152 / SHARE-153)', () => {
  /*
   * Mirror the actual SHARE-152 / SHARE-153 event shape: mechanism
   * `onerror`, single-frame stack at `<anonymous>:1:60`. Both issues
   * shared the same trace_id from a single Chrome Mobile WebView 76
   * device running an injected script that fails on our DOM.
   */
  const anonymousOnerrorEvent = (message) => ({
    exception: {
      values: [{
        type: 'TypeError',
        value: message,
        mechanism: {type: 'onerror', handled: false},
        stacktrace: {
          frames: [{filename: '<anonymous>'}],
        },
      }],
    },
  })

  it('drops events with mechanism=onerror and an all-anonymous stack', () => {
    expect(shouldSendSentryEvent(
      anonymousOnerrorEvent(`Cannot read properties of null (reading 'querySelector')`),
    )).toBe(false)
  })

  it('drops when every frame is anonymous/unknown/missing, even with several frames', () => {
    const event = {
      exception: {
        values: [{
          mechanism: {type: 'onerror'},
          stacktrace: {
            frames: [
              {filename: '<anonymous>'},
              {filename: '<unknown>'},
              {filename: null},
              {/* missing */},
            ],
          },
        }],
      },
    }
    expect(shouldSendSentryEvent(event)).toBe(false)
  })

  it('keeps onerror events that have any first-party frame in the stack', () => {
    const event = {
      exception: {
        values: [{
          mechanism: {type: 'onerror'},
          stacktrace: {
            frames: [
              {filename: '<anonymous>'},
              {filename: 'src/Containers/CadView.jsx'},
            ],
          },
        }],
      },
    }
    expect(shouldSendSentryEvent(event)).toBe(true)
  })

  it('keeps anonymous-only stacks when the mechanism is NOT onerror', () => {
    const event = {
      exception: {
        values: [{
          // e.g. caught via Sentry.captureException directly, not via window.onerror
          mechanism: {type: 'generic'},
          stacktrace: {frames: [{filename: '<anonymous>'}]},
        }],
      },
    }
    expect(shouldSendSentryEvent(event)).toBe(true)
  })

  /*
   * The heuristic is intentionally restricted to values[0] — a
   * chained exception with a legitimate first-party top frame
   * should NOT be suppressed just because the cause happens to be
   * an anonymous onerror. Locks the JSDoc-documented behavior in.
   */
  it('keeps chained exceptions where the wrapper is first-party even if the cause is anonymous-onerror', () => {
    const event = {
      exception: {
        values: [
          {
            mechanism: {type: 'generic'},
            stacktrace: {frames: [{filename: 'src/Containers/CadView.jsx'}]},
          },
          {
            mechanism: {type: 'onerror'},
            stacktrace: {frames: [{filename: '<anonymous>'}]},
          },
        ],
      },
    }
    expect(shouldSendSentryEvent(event)).toBe(true)
  })

  it('fires gtagEvent("anonymous_injected_error") on the first drop', () => {
    expect(shouldSendSentryEvent(anonymousOnerrorEvent('x'))).toBe(false)
    expect(gtagEvent).toHaveBeenCalledTimes(1)
    expect(gtagEvent).toHaveBeenCalledWith('anonymous_injected_error', {})
  })

  it('does not re-fire gtagEvent on subsequent drops in the same session', () => {
    shouldSendSentryEvent(anonymousOnerrorEvent('x'))
    shouldSendSentryEvent(anonymousOnerrorEvent('y'))
    shouldSendSentryEvent(anonymousOnerrorEvent('z'))
    expect(gtagEvent).toHaveBeenCalledTimes(1)
  })

  it('tracks the two noise sources independently — RUM and anonymous each fire once', () => {
    const rumEvent = {
      exception: {
        values: [{stacktrace: {frames: [{filename: '/.netlify/scripts/rum'}]}}],
      },
    }
    shouldSendSentryEvent(rumEvent)
    shouldSendSentryEvent(anonymousOnerrorEvent('x'))
    shouldSendSentryEvent(rumEvent)
    shouldSendSentryEvent(anonymousOnerrorEvent('y'))
    expect(gtagEvent).toHaveBeenCalledTimes(2)
    expect(gtagEvent).toHaveBeenCalledWith('netlify_rum_blocked', {})
    expect(gtagEvent).toHaveBeenCalledWith('anonymous_injected_error', {})
  })
})
