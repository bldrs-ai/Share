import useStore from '../store/useStore'
import {CAPTURE_FAILURES, captureViewerFrame} from '../viewer/frameCapture'
import {MAX_SCREENSHOT_CHARS} from './feedbackRecord'
import {FAILURE_STAGES, reportFeedbackFailure} from './submitFeedback'


/**
 * A screenshot of the 3D view for a feedback record, taken only when the
 * user asks (the attach control in FeedbackNote.jsx): never on its own, and
 * only ever sent to Bldrs' feedback store with the record, never to GA,
 * which hears just `has_screenshot` (design/tracks/community-t100/feedback.md §"Privacy").
 *
 * A capture can fail where the GPU or browser won't give the frame up (no
 * viewer yet, a lost context, a JPEG encoder missing). That is expected
 * there, so it is a quiet hint for the user and one structured
 * `feedback_failed` (`stage: 'screenshot'`) for the count, never Sentry.
 *
 * @param {object} options
 * @param {string} options.source FEEDBACK_SOURCES, for the failure count
 * @param {object} [options.viewer] the store's, by default
 * @param {Function} [options.capture] for tests: viewer/frameCapture.js#captureViewerFrame's stand-in
 * @return {Promise<?string>} the JPEG data URL, or null when it failed
 */
export async function captureViewerScreenshot({source, viewer = useStore.getState().viewer,
  capture = captureViewerFrame}) {
  try {
    return await capture(viewer, {maxChars: MAX_SCREENSHOT_CHARS})
  } catch (e) {
    const reason = Object.values(CAPTURE_FAILURES).includes(e?.reason) ? e.reason : CAPTURE_FAILURES.ENCODE
    reportFeedbackFailure({source, stage: FAILURE_STAGES.SCREENSHOT, reason})
    return null
  }
}
