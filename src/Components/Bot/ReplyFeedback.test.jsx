import React, {useSyncExternalStore} from 'react'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import useStore from '../../store/useStore'
import ReplyFeedback, {NOTE_HELPER_TEXT, NOTE_PLACEHOLDER, SEND_FAILED_TEXT, SENT_TEXT} from './ReplyFeedback'
import {captureViewerScreenshot} from '../../feedback/captureScreenshot'
import {SCREENSHOT} from '../../feedback/feedback.fixture'
import {FEEDBACK_FAILED_EVENT, FEEDBACK_SUBMITTED_EVENT} from '../../feedback/submitFeedback'
import {resetReplyFeedbackPosts} from './assistFeedback'
import {assistAuth, assistChat, resetAssistChat} from './assistState'


jest.mock('../../feedback/captureScreenshot', () => ({captureViewerScreenshot: jest.fn()}))


const MESSAGES = [
  {id: 'u1', kind: 'user', text: 'select the walls'},
  {id: 'a1', kind: 'assistant', text: 'Selected 2 walls.', turn: 't1', stats: {steps: 2, modelChoice: 'default'}},
]


/**
 * The reply as the chat holds it, so a rating the component sends comes
 * back as its `message`, as in BotChat.
 *
 * @return {React.ReactElement}
 */
function Harness() {
  const {messages} = useSyncExternalStore(assistChat.subscribe, assistChat.get)
  const message = messages.find((m) => m.id === 'a1')
  return message ? <ReplyFeedback message={message}/> : null
}


/** @return {Array<object>} the stored records, oldest first */
function stored() {
  return Object.values(window.__mockFeedback ?? {})
}


/** @return {Array<object>} the params of each feedback_submitted sent */
function feedbackEvents() {
  return window.gtag.mock.calls.filter(([, name]) => name === FEEDBACK_SUBMITTED_EVENT).map(([, , params]) => params)
}


describe('Bot/ReplyFeedback', () => {
  beforeEach(() => {
    window.gtag = jest.fn()
    window.__mockFeedback = {}
    window.__mockFeedbackFail = false
    assistAuth.current = {isAuthenticated: false}
    act(() => {
      resetReplyFeedbackPosts()
      useStore.setState({modelPath: null, rootElement: null, selectedAnchorIds: [], cameraControls: null})
      resetAssistChat()
      assistChat.update((chat) => ({...chat, messages: MESSAGES}))
    })
  })

  afterEach(() => {
    delete window.gtag
    act(() => resetAssistChat())
  })

  it('shows both thumbs, outlined, hidden until hover or focus, and no note', () => {
    render(<Harness/>, {wrapper: HelmetStoreRouteThemeCtx})
    expect(screen.getByRole('button', {name: 'Good reply'})).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', {name: 'Bad reply'})).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('ThumbUpOutlinedIcon')).toBeInTheDocument()
    expect(screen.getByTestId('BotChat-Feedback')).toHaveAttribute('data-always-shown', 'false')
    expect(screen.queryByTestId('Feedback-Note')).toBeNull()
  })

  it('is always shown in the phone layout', () => {
    render(<ReplyFeedback message={MESSAGES[1]} alwaysShown/>, {wrapper: HelmetStoreRouteThemeCtx})
    expect(screen.getByTestId('BotChat-Feedback')).toHaveAttribute('data-always-shown', 'true')
  })

  it('a thumb fills and opens the note, focused, with its placeholder and what is shared; Send rates with the note', async () => {
    render(<Harness/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByRole('button', {name: 'Bad reply'}))
    expect(screen.getByRole('button', {name: 'Bad reply'})).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('ThumbDownIcon')).toBeInTheDocument()
    const note = screen.getByPlaceholderText(NOTE_PLACEHOLDER)
    expect(note).toHaveFocus()
    expect(screen.getByText(NOTE_HELPER_TEXT)).toBeInTheDocument()
    // Nothing is sent until Send.
    expect(window.gtag).not.toHaveBeenCalled()

    fireEvent.change(note, {target: {value: 'wrong walls'}})
    fireEvent.click(screen.getByTestId('Feedback-Send'))
    expect(await screen.findByText(SENT_TEXT)).toBeInTheDocument()
    expect(screen.queryByTestId('Feedback-Note')).toBeNull()
    expect(screen.getByRole('button', {name: 'Bad reply'})).toHaveAttribute('aria-pressed', 'true')
    expect(feedbackEvents()).toEqual([expect.objectContaining({feedback_source: 'assist_reply', rating: 'down',
      has_note: 'true', has_screenshot: 'false', steps: 2})])
    expect(stored()).toEqual([expect.objectContaining({source: 'assist_reply', rating: 'down', note: 'wrong walls',
      screenshot: null, context: expect.objectContaining({reply: 'Selected 2 walls.', prompt: 'select the walls',
        reply_id: 'a1'})})])
  })

  it('attaches a screenshot to the rating, which goes to the store and only as a boolean to GA', async () => {
    jest.mocked(captureViewerScreenshot).mockResolvedValue(SCREENSHOT)
    render(<Harness/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByRole('button', {name: 'Bad reply'}))
    fireEvent.click(screen.getByRole('button', {name: 'Attach screenshot'}))
    await screen.findByTestId('Feedback-Screenshot')
    fireEvent.click(screen.getByTestId('Feedback-Send'))
    await waitFor(() => expect(stored()).toHaveLength(1))
    expect(stored()[0].screenshot).toBe(SCREENSHOT)
    expect(feedbackEvents()).toEqual([expect.objectContaining({has_screenshot: 'true'})])
    expect(JSON.stringify(window.gtag.mock.calls)).not.toContain('base64')
  })

  // Codex round 3 on #2313: a capture started in a cancelled draft must not
  // attach to the next one.
  it('a capture from a cancelled draft does not attach to the next draft', async () => {
    let finish = () => undefined
    jest.mocked(captureViewerScreenshot).mockReturnValueOnce(new Promise((resolve) => {
      finish = () => resolve(SCREENSHOT)
    }))
    render(<Harness/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByRole('button', {name: 'Good reply'}))
    fireEvent.click(screen.getByRole('button', {name: 'Attach screenshot'}))
    fireEvent.click(screen.getByTestId('Feedback-Cancel'))
    fireEvent.click(screen.getByRole('button', {name: 'Bad reply'}))
    await act(() => Promise.resolve(finish()))
    expect(screen.queryByTestId('Feedback-Screenshot')).toBeNull()
    fireEvent.click(screen.getByTestId('Feedback-Send'))
    await waitFor(() => expect(stored()).toHaveLength(1))
    expect(stored()[0]).toMatchObject({rating: 'down', screenshot: null})
    expect(feedbackEvents()).toEqual([expect.objectContaining({has_screenshot: 'false'})])
  })

  it('Enter in the note sends without a note', async () => {
    render(<Harness/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByRole('button', {name: 'Good reply'}))
    fireEvent.keyDown(screen.getByPlaceholderText(NOTE_PLACEHOLDER), {key: 'Enter'})
    await waitFor(() => expect(stored()).toHaveLength(1))
    expect(stored()[0]).toMatchObject({rating: 'up', note: ''})
    expect(feedbackEvents()).toEqual([expect.objectContaining({rating: 'up', has_note: 'false'})])
  })

  it('Cancel, or the same thumb again, closes the note and sends nothing', () => {
    render(<Harness/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByRole('button', {name: 'Good reply'}))
    fireEvent.click(screen.getByTestId('Feedback-Cancel'))
    expect(screen.queryByTestId('Feedback-Note')).toBeNull()
    expect(screen.getByRole('button', {name: 'Good reply'})).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', {name: 'Good reply'}))
    fireEvent.click(screen.getByRole('button', {name: 'Good reply'}))
    expect(screen.queryByTestId('Feedback-Note')).toBeNull()
    expect(window.gtag).not.toHaveBeenCalled()
  })

  it('a rating can be changed, each change its own event, and cleared by its filled thumb', async () => {
    render(<Harness/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByRole('button', {name: 'Good reply'}))
    fireEvent.click(screen.getByTestId('Feedback-Send'))
    await screen.findByText(SENT_TEXT)

    // Changed: the other thumb opens the note again, and Send rates anew.
    fireEvent.click(screen.getByRole('button', {name: 'Bad reply'}))
    expect(screen.getByRole('button', {name: 'Bad reply'})).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', {name: 'Good reply'})).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByTestId('Feedback-Send'))
    await waitFor(() => expect(feedbackEvents()).toHaveLength(2))

    // Cleared: the filled thumb, with no note open, takes the rating back.
    await waitFor(() => expect(screen.queryByTestId('Feedback-Note')).toBeNull())
    fireEvent.click(screen.getByRole('button', {name: 'Bad reply'}))
    await waitFor(() => expect(feedbackEvents()).toHaveLength(3))
    expect(screen.getByRole('button', {name: 'Bad reply'})).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', {name: 'Good reply'})).toHaveAttribute('aria-pressed', 'false')
    expect(feedbackEvents().map((p) => p.rating)).toEqual(['up', 'down', 'none'])
    const ids = feedbackEvents().map((p) => p.feedback_id)
    expect(new Set(ids).size).toBe(3)
    await waitFor(() => expect(stored().map((r) => r.rating)).toEqual(['up', 'down', 'none']))
  })

  // Codex on #2313: a clear's record is kept for a retry, as a rating's is.
  it('a failed clear offers Try again, which posts the same clear record and tells GA nothing new', async () => {
    render(<Harness/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByRole('button', {name: 'Good reply'}))
    fireEvent.click(screen.getByTestId('Feedback-Send'))
    await screen.findByText(SENT_TEXT)

    window.__mockFeedbackFail = true
    fireEvent.click(screen.getByRole('button', {name: 'Good reply'}))
    expect(await screen.findByText(SEND_FAILED_TEXT)).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Good reply'})).toHaveAttribute('aria-pressed', 'false')
    expect(feedbackEvents().map((p) => p.rating)).toEqual(['up', 'none'])
    const clearId = feedbackEvents()[1].feedback_id
    expect(stored().map((r) => r.rating)).toEqual(['up'])

    window.__mockFeedbackFail = false
    fireEvent.click(screen.getByTestId('BotChat-FeedbackRetry'))
    expect(await screen.findByText(SENT_TEXT)).toBeInTheDocument()
    expect(screen.queryByTestId('BotChat-FeedbackRetry')).toBeNull()
    // The same record, landed; GA counted the clear once.
    expect(stored().map((r) => [r.rating, r.feedback_id])).toEqual([['up', expect.any(String)], ['none', clearId]])
    expect(feedbackEvents()).toHaveLength(2)
  })

  /**
   * Hold the next feedback post until the test lets it go; every other
   * request goes through as usual (MSW).
   *
   * @return {object} `{spy, release(response), fail()}`
   */
  function holdNextFeedbackPost() {
    const original = globalThis.fetch
    let settle = null
    const spy = jest.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
      if (String(url).endsWith('/.netlify/functions/feedback') && settle === null) {
        return new Promise((resolve, reject) => {
          settle = {resolve, reject}
        })
      }
      return original(url, init)
    })
    return {
      spy,
      release: (response) => act(() => Promise.resolve(settle.resolve(response))),
      fail: () => act(() => Promise.resolve(settle.reject(new TypeError('Failed to fetch')))),
    }
  }

  // Codex round 2 on #2313: a slow clear must not land after a newer rating.
  it('holds the thumbs while a clear posts, so a newer rating can\'t be overtaken by it', async () => {
    render(<Harness/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByRole('button', {name: 'Good reply'}))
    fireEvent.click(screen.getByTestId('Feedback-Send'))
    await screen.findByText(SENT_TEXT)

    const held = holdNextFeedbackPost()
    try {
      fireEvent.click(screen.getByRole('button', {name: 'Good reply'}))
      await waitFor(() => expect(screen.getByRole('button', {name: 'Bad reply'})).toBeDisabled())
      expect(screen.getByRole('button', {name: 'Good reply'})).toBeDisabled()
      // A click on the held thumbs does nothing: no note opens, nothing is sent.
      fireEvent.click(screen.getByRole('button', {name: 'Bad reply'}))
      expect(screen.queryByTestId('Feedback-Note')).toBeNull()
      expect(feedbackEvents().map((p) => p.rating)).toEqual(['up', 'none'])

      await held.release(new Response(null, {status: 204}))
      await waitFor(() => expect(screen.getByRole('button', {name: 'Bad reply'})).toBeEnabled())
    } finally {
      held.spy.mockRestore()
    }
    fireEvent.click(screen.getByRole('button', {name: 'Bad reply'}))
    fireEvent.click(screen.getByTestId('Feedback-Send'))
    await waitFor(() => expect(feedbackEvents().map((p) => p.rating)).toEqual(['up', 'none', 'down']))
  })

  // Codex round 3 on #2313: the panel unmounts when closed or on a phone tab
  // switch, while the clear it started keeps running.
  it('keeps the thumbs held across an unmount while a clear posts, and keeps a failed clear\'s retry', async () => {
    const first = render(<Harness/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByRole('button', {name: 'Good reply'}))
    fireEvent.click(screen.getByTestId('Feedback-Send'))
    await screen.findByText(SENT_TEXT)

    const held = holdNextFeedbackPost()
    try {
      fireEvent.click(screen.getByRole('button', {name: 'Good reply'}))
      await waitFor(() => expect(screen.getByRole('button', {name: 'Bad reply'})).toBeDisabled())
      first.unmount()
      render(<Harness/>, {wrapper: HelmetStoreRouteThemeCtx})
      // A fresh instance, the clear still in flight: still held.
      expect(screen.getByRole('button', {name: 'Bad reply'})).toBeDisabled()
      expect(screen.getByRole('button', {name: 'Good reply'})).toBeDisabled()
      await held.fail()
    } finally {
      held.spy.mockRestore()
    }
    // The clear failed after the remount: this instance offers its retry.
    await waitFor(() => expect(screen.getByRole('button', {name: 'Bad reply'})).toBeEnabled())
    expect(screen.getByText(SEND_FAILED_TEXT)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('BotChat-FeedbackRetry'))
    expect(await screen.findByText(SENT_TEXT)).toBeInTheDocument()
    expect(stored().map((r) => r.rating)).toEqual(['up', 'none'])
    expect(feedbackEvents()).toHaveLength(2)
  })

  // Codex's ready-time review on #2313: a failed rating's record must
  // outlive the component, which unmounts with the panel.
  it('keeps a failed rating\'s retry across an unmount, retries the same record, and posts no none', async () => {
    window.__mockFeedbackFail = true
    const first = render(<Harness/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByRole('button', {name: 'Bad reply'}))
    fireEvent.change(screen.getByPlaceholderText(NOTE_PLACEHOLDER), {target: {value: 'wrong walls'}})
    fireEvent.click(screen.getByTestId('Feedback-Send'))
    expect(await screen.findByText(SEND_FAILED_TEXT)).toBeInTheDocument()
    expect(stored()).toEqual([])
    const ratedId = feedbackEvents()[0].feedback_id
    first.unmount()

    window.__mockFeedbackFail = false
    render(<Harness/>, {wrapper: HelmetStoreRouteThemeCtx})
    // The reopened reply still says it failed, and offers the retry.
    expect(screen.getByRole('button', {name: 'Bad reply'})).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(SEND_FAILED_TEXT)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('BotChat-FeedbackRetry'))
    expect(await screen.findByText(SENT_TEXT)).toBeInTheDocument()
    expect(stored()).toEqual([expect.objectContaining({feedback_id: ratedId, rating: 'down', note: 'wrong walls'})])
    expect(feedbackEvents()).toHaveLength(1)
    expect(stored().some((r) => r.rating === 'none')).toBe(false)
  })

  it('the filled thumb of a rating that never landed takes it back without posting a none', async () => {
    window.__mockFeedbackFail = true
    const first = render(<Harness/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByRole('button', {name: 'Good reply'}))
    fireEvent.click(screen.getByTestId('Feedback-Send'))
    expect(await screen.findByText(SEND_FAILED_TEXT)).toBeInTheDocument()
    first.unmount()
    window.__mockFeedbackFail = false
    render(<Harness/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByRole('button', {name: 'Good reply'}))
    expect(screen.getByRole('button', {name: 'Good reply'})).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByTestId('BotChat-FeedbackRetry')).toBeNull()
    expect(screen.queryByText(SEND_FAILED_TEXT)).toBeNull()
    expect(feedbackEvents().map((p) => p.rating)).toEqual(['up'])
    expect(stored()).toEqual([])
  })

  it('a newer rating drops a failed clear\'s retry, so the clear can\'t retract it later', async () => {
    render(<Harness/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByRole('button', {name: 'Good reply'}))
    fireEvent.click(screen.getByTestId('Feedback-Send'))
    await screen.findByText(SENT_TEXT)
    const held = holdNextFeedbackPost()
    try {
      fireEvent.click(screen.getByRole('button', {name: 'Good reply'}))
      await waitFor(() => expect(screen.getByRole('button', {name: 'Bad reply'})).toBeDisabled())
      await held.fail()
    } finally {
      held.spy.mockRestore()
    }
    expect(await screen.findByTestId('BotChat-FeedbackRetry')).toBeEnabled()
    fireEvent.click(screen.getByRole('button', {name: 'Bad reply'}))
    expect(screen.queryByTestId('BotChat-FeedbackRetry')).toBeNull()
    fireEvent.click(screen.getByTestId('Feedback-Send'))
    await waitFor(() => expect(stored().map((r) => r.rating)).toEqual(['up', 'down']))
    expect(screen.queryByTestId('BotChat-FeedbackRetry')).toBeNull()
  })

  it('a failed post shows the quiet hint and counts it; Send tries the same record again', async () => {
    window.__mockFeedbackFail = true
    render(<Harness/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByRole('button', {name: 'Bad reply'}))
    fireEvent.change(screen.getByPlaceholderText(NOTE_PLACEHOLDER), {target: {value: 'nope'}})
    fireEvent.click(screen.getByTestId('Feedback-Send'))
    expect(await screen.findByText(SEND_FAILED_TEXT)).toBeInTheDocument()
    expect(screen.getByTestId('Feedback-Note')).toBeInTheDocument()
    const failed = window.gtag.mock.calls.filter(([, name]) => name === FEEDBACK_FAILED_EVENT)
    expect(failed).toHaveLength(1)
    expect(stored()).toEqual([])

    window.__mockFeedbackFail = false
    fireEvent.click(screen.getByTestId('Feedback-Send'))
    expect(await screen.findByText(SENT_TEXT)).toBeInTheDocument()
    // One rating: GA was told once, and the store got the record it missed.
    expect(feedbackEvents()).toHaveLength(1)
    expect(stored()).toEqual([expect.objectContaining({feedback_id: feedbackEvents()[0].feedback_id, note: 'nope'})])
  })
})
