import React, {useSyncExternalStore} from 'react'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import useStore from '../../store/useStore'
import ReplyFeedback, {NOTE_HELPER_TEXT, NOTE_PLACEHOLDER, SEND_FAILED_TEXT, SENT_TEXT} from './ReplyFeedback'
import {captureViewerScreenshot} from '../../feedback/captureScreenshot'
import {SCREENSHOT} from '../../feedback/feedback.fixture'
import {FEEDBACK_FAILED_EVENT, FEEDBACK_SUBMITTED_EVENT} from '../../feedback/submitFeedback'
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
