import {CAPTURE_FAILURES} from '../viewer/frameCapture'
import {captureViewerScreenshot} from './captureScreenshot'
import {SCREENSHOT} from './feedback.fixture'
import {MAX_SCREENSHOT_CHARS} from './feedbackRecord'
import {FEEDBACK_FAILED_EVENT} from './submitFeedback'


describe('feedback/captureScreenshot', () => {
  beforeEach(() => {
    window.gtag = jest.fn()
  })

  afterEach(() => {
    delete window.gtag
  })

  it('captures the viewer within the record\'s screenshot cap, and sends nothing to GA', async () => {
    const viewer = {}
    const capture = jest.fn(() => Promise.resolve(SCREENSHOT))
    expect(await captureViewerScreenshot({source: 'general', viewer, capture})).toBe(SCREENSHOT)
    expect(capture).toHaveBeenCalledWith(viewer, {maxChars: MAX_SCREENSHOT_CHARS})
    expect(window.gtag).not.toHaveBeenCalled()
  })

  it.each([CAPTURE_FAILURES.NO_VIEWER, CAPTURE_FAILURES.TIMEOUT, CAPTURE_FAILURES.TOO_LARGE])(
    'answers null for a %s failure and counts it as one structured feedback_failed', async (reason) => {
      const capture = () => Promise.reject(Object.assign(new Error('nope'), {reason}))
      expect(await captureViewerScreenshot({source: 'assist_reply', capture})).toBeNull()
      expect(window.gtag.mock.calls).toEqual([['event', FEEDBACK_FAILED_EVENT,
        {feedback_source: 'assist_reply', stage: 'screenshot', reason}]])
    })

  it('names an unexpected error encode, never its text', async () => {
    const capture = () => Promise.reject(new Error('SecurityError: tainted canvas at /private/Tower.ifc'))
    await captureViewerScreenshot({source: 'general', capture})
    expect(window.gtag.mock.calls[0][2]).toEqual({feedback_source: 'general', stage: 'screenshot', reason: 'encode'})
  })
})
