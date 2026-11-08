import {init} from '@sentry/react'
import {gtagEvent, isAllowed} from '../privacy/analytics'
import {redactBreadcrumb} from '../privacy/sentryRedaction'
import setupSentry, {shouldSendSentryEvent, shadowReportedCondition, _resetSentryFilterStateForTests} from './sentry'


jest.mock('../privacy/analytics', () => ({gtagEvent: jest.fn(), isAllowed: jest.fn(() => true)}))
jest.mock('@sentry/react', () => ({
  ...jest.requireActual('@sentry/react'),
  init: jest.fn(),
}))


beforeEach(() => {
  jest.clearAllMocks()
  // clearAllMocks keeps queued mockReturnValueOnce values, so a consent test
  // that fails early must not leak `false` into the next test.
  isAllowed.mockReset()
  isAllowed.mockReturnValue(true)
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

  it('does not consume the once-per-session signal while consent is off', () => {
    isAllowed.mockReturnValueOnce(false)
    expect(shouldSendSentryEvent(rumEvent())).toBe(false)
    expect(gtagEvent).not.toHaveBeenCalled()
    // Consent granted later in the same page session: the signal still sends.
    expect(shouldSendSentryEvent(rumEvent())).toBe(false)
    expect(gtagEvent).toHaveBeenCalledTimes(1)
    expect(gtagEvent).toHaveBeenCalledWith('netlify_rum_blocked', {})
  })

  it('leaves the signal unrecorded when gtagEvent throws, so the next drop retries', () => {
    gtagEvent.mockImplementationOnce(() => {
      throw new Error('gtag blew up')
    })
    shouldSendSentryEvent(rumEvent())
    shouldSendSentryEvent(rumEvent())
    expect(gtagEvent).toHaveBeenCalledTimes(2)
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


// The redaction is only as good as its wiring: without this, console
// breadcrumbs naming the user's file reach Sentry however correct
// privacy/sentryRedaction.js is.
describe('setupSentry', () => {
  it('rewrites breadcrumbs through redactBreadcrumb', () => {
    setupSentry()
    expect(init).toHaveBeenCalledTimes(1)
    expect(init.mock.calls[0][0].beforeBreadcrumb).toBe(redactBreadcrumb)
  })
})


describe('shouldSendSentryEvent — in-app browser bridge globals (SHARE-1X7)', () => {
  /*
   * SHARE-1X7's shape: Zalo's iOS WKWebView host evaluates its bridge
   * script against the page, so the frame is the page's own URL at line 1
   * rather than `<anonymous>`, which the anonymous heuristic would catch.
   */
  const bridgeEvent = ({type = 'ReferenceError', value = 'Can\'t find variable: zaloJSV2', mechanism = 'onerror'} = {}) => ({
    exception: {
      values: [{
        type,
        value,
        mechanism: {type: mechanism, handled: false},
        stacktrace: {frames: [{filename: '/share/v/p/index.ifc', lineno: 1, colno: 21}]},
      }],
    },
  })

  it('drops the Zalo bridge ReferenceError and fires its GA signal once', () => {
    expect(shouldSendSentryEvent(bridgeEvent())).toBe(false)
    expect(shouldSendSentryEvent(bridgeEvent({value: 'zaloJSV2 is not defined'}))).toBe(false)
    expect(gtagEvent).toHaveBeenCalledTimes(1)
    expect(gtagEvent).toHaveBeenCalledWith('in_app_browser_bridge_error', {})
  })

  it('keeps a ReferenceError naming any other variable', () => {
    expect(shouldSendSentryEvent(bridgeEvent({value: 'Can\'t find variable: zaloJSV2Helper'}))).toBe(true)
    expect(shouldSendSentryEvent(bridgeEvent({value: 'Can\'t find variable: shareViewer'}))).toBe(true)
  })

  it('keeps the bridge name when it is not an uncaught ReferenceError', () => {
    expect(shouldSendSentryEvent(bridgeEvent({type: 'TypeError'}))).toBe(true)
    expect(shouldSendSentryEvent(bridgeEvent({mechanism: 'onunhandledrejection'}))).toBe(true)
    expect(gtagEvent).not.toHaveBeenCalled()
  })
})


describe('shadowReportedCondition', () => {
  const fingerprinted = (extra = {}) => ({
    level: 'warning',
    fingerprint: ['opfs-source', 'download-failed', 'http-error', 'external'],
    ...extra,
  })

  it('sends one GA event for a custom-fingerprint warning, with exactly level and category', () => {
    // A load.phase tag (possibly a sticky one from an earlier stalled load)
    // must not reach GA.
    shadowReportedCondition(fingerprinted({tags: {'load.phase': 'download'}}))
    expect(gtagEvent).toHaveBeenCalledTimes(1)
    expect(gtagEvent.mock.calls[0]).toEqual(['reported_condition', {
      level: 'warning',
      category: 'opfs-source/download-failed',
    }])
  })

  it('uses the exception type when there is no custom fingerprint', () => {
    shadowReportedCondition({exception: {values: [{type: 'TypeError', value: 'x'}]}})
    expect(gtagEvent).toHaveBeenCalledWith('reported_condition', {level: 'error', category: 'TypeError'})
    shadowReportedCondition({fingerprint: ['{{ default }}', 'x'], exception: {values: [{type: 'RangeError'}]}})
    expect(gtagEvent).toHaveBeenLastCalledWith('reported_condition', {level: 'error', category: 'RangeError'})
  })

  it('does not fire for info-level events', () => {
    shadowReportedCondition(fingerprinted({level: 'info'}))
    expect(gtagEvent).not.toHaveBeenCalled()
  })

  it('fires once per (level, category), again for a different category', () => {
    shadowReportedCondition(fingerprinted())
    shadowReportedCondition(fingerprinted())
    expect(gtagEvent).toHaveBeenCalledTimes(1)
    shadowReportedCondition(fingerprinted({fingerprint: ['opfs-source', 'other']}))
    expect(gtagEvent).toHaveBeenCalledTimes(2)
  })

  it('beforeSend does not report events dropped as third-party noise', () => {
    setupSentry()
    const {beforeSend} = init.mock.calls[0][0]
    const noise = {exception: {values: [{type: 'TypeError', stacktrace: {frames: [{filename: '/.netlify/scripts/rum'}]}}]}}
    expect(beforeSend(noise)).toBeNull()
    expect(gtagEvent).not.toHaveBeenCalledWith('reported_condition', expect.anything())
    const real = {exception: {values: [{type: 'TypeError'}]}}
    expect(beforeSend(real)).toBe(real)
    expect(gtagEvent).toHaveBeenCalledWith('reported_condition', {level: 'error', category: 'TypeError'})
  })

  it('never sends message, exception value or breadcrumb text to GA', () => {
    const secret = 'secret-org/secret-repo/main/private.ifc'
    shadowReportedCondition({
      message: `failed ${secret}`,
      exception: {values: [{type: 'Error', value: `404 ${secret}`}]},
      breadcrumbs: [{message: `fetch ${secret}`}],
    })
    shadowReportedCondition(fingerprinted({message: secret, breadcrumbs: [{message: secret}]}))
    expect(gtagEvent).toHaveBeenCalled()
    expect(JSON.stringify(gtagEvent.mock.calls)).not.toMatch(/secret|private\.ifc/)
  })

  it('skips an event its reporter already counted in GA (trackAlert)', () => {
    shadowReportedCondition({
      level: 'error',
      fingerprint: ['alert', 'Failed to parse model'],
      tags: {ga_counted: 'alert'},
    })
    shadowReportedCondition({exception: {values: [{type: 'Error'}]}, tags: {ga_counted: 'alert'}})
    expect(gtagEvent).not.toHaveBeenCalled()
  })

  it('does not consume a condition while analytics consent is off', () => {
    const event = {level: 'warning', exception: {values: [{type: 'TypeError'}]}}
    isAllowed.mockReturnValueOnce(false)
    shadowReportedCondition(event)
    expect(gtagEvent).not.toHaveBeenCalled()
    // Consent granted later in the same page session: the condition still sends.
    shadowReportedCondition(event)
    expect(gtagEvent).toHaveBeenCalledTimes(1)
  })

  it('retries a condition whose GA send threw', () => {
    gtagEvent.mockImplementationOnce(() => {
      throw new Error('gtag boom')
    })
    const event = {level: 'warning', exception: {values: [{type: 'TypeError'}]}}
    shadowReportedCondition(event)
    shadowReportedCondition(event)
    shadowReportedCondition(event)
    expect(gtagEvent).toHaveBeenCalledTimes(2)
  })

  it('a throwing gtagEvent does not change beforeSend\'s return', () => {
    gtagEvent.mockImplementationOnce(() => {
      throw new Error('gtag boom')
    })
    setupSentry()
    const {beforeSend} = init.mock.calls[0][0]
    const event = {exception: {values: [{type: 'TypeError'}]}}
    expect(beforeSend(event)).toBe(event)
    expect(gtagEvent).toHaveBeenCalled()
  })
})
