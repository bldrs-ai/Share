import {act} from '@testing-library/react'
import {HOSTED_TRANSPORT_ID} from '../../assist'
import {SCREENSHOT, setFeedbackStore} from '../../feedback/feedback.fixture'
import {isFeedbackRecord} from '../../feedback/feedbackRecord'
import {FEEDBACK_SUBMITTED_EVENT} from '../../feedback/submitFeedback'
import {ASSIST_FREE_MODELS, ASSIST_MODEL} from '../../tools/assistModels'
import {RATINGS, modelChoiceOf, rateReply, ratableReplyIds, replyContext} from './assistFeedback'
import {assistAuth, assistChat, resetAssistChat} from './assistState'


// One finished turn whose text is split around its task chip into two bubbles.
const MESSAGES = [
  {id: 'u0', kind: 'user', text: 'hi'},
  {id: 'a0', kind: 'assistant', text: 'Hello.', turn: 't0', stats: {steps: 1, modelChoice: 'default'}},
  {id: 'u1', kind: 'user', text: 'select the walls in Tower B.ifc'},
  {id: 'a1', kind: 'assistant', text: 'Looking in tower b.ifc.', turn: 't1', stats: {steps: 3, modelChoice: 'byok'}},
  {id: 'c1', kind: 'tasks', turn: 't1', tasks: [{callId: 'x'}, {callId: 'y'}]},
  {id: 'a2', kind: 'assistant', text: 'Selected 2 walls.', turn: 't1', stats: {steps: 3, modelChoice: 'byok'}},
]


describe('Bot/assistFeedback', () => {
  beforeEach(() => {
    window.gtag = jest.fn()
    window.__mockFeedback = {}
    window.__mockFeedbackFail = false
    assistAuth.current = {isAuthenticated: false}
    setFeedbackStore()
    act(() => {
      resetAssistChat()
      assistChat.update((chat) => ({...chat, messages: MESSAGES}))
    })
  })

  afterEach(() => {
    delete window.gtag
    act(() => resetAssistChat())
  })

  it('offers a rating on each ended turn\'s last reply only', () => {
    expect([...ratableReplyIds(MESSAGES, null)]).toEqual(['a0', 'a2'])
    expect([...ratableReplyIds(MESSAGES, 't1')]).toEqual(['a0'])
    const live = MESSAGES.map((m) => (m.id === 'a2' ? {...m, live: true} : m))
    expect([...ratableReplyIds(live, null)]).toEqual(['a0', 'a1'])
  })

  it('rates the whole turn: every reply bubble, the message it answered, its steps and tool calls', () => {
    expect(replyContext(MESSAGES, 'a2')).toEqual({reply_id: 'a2', reply: 'Looking in tower b.ifc.\n\nSelected 2 walls.',
      prompt: 'select the walls in Tower B.ifc', model_choice: 'byok', steps: 3, tool_calls: 2})
    expect(replyContext(MESSAGES, 'gone')).toBeNull()
  })

  it.each([
    ['openrouter', ASSIST_MODEL, 'byok'],
    [HOSTED_TRANSPORT_ID, ASSIST_MODEL, 'default'],
    [HOSTED_TRANSPORT_ID, null, 'default'],
    [HOSTED_TRANSPORT_ID, ASSIST_FREE_MODELS, 'free_models'],
    [HOSTED_TRANSPORT_ID, 'anthropic/claude-x', 'picked'],
  ])('classes a %s turn that asked for %s as %s', (transport, model, choice) => {
    expect(modelChoiceOf(transport, model)).toBe(choice)
  })

  it('rateReply sends an assist_reply record through the module, and keeps the rating on the reply', async () => {
    const {ok, record} = await rateReply({replyId: 'a2', rating: RATINGS.UP, note: 'good', screenshot: SCREENSHOT})
    expect(ok).toBe(true)
    expect(isFeedbackRecord(record)).toBe(true)
    expect(record).toMatchObject({source: 'assist_reply', rating: 'up', note: 'good', screenshot: SCREENSHOT,
      context: replyContext(MESSAGES, 'a2')})
    expect(window.__mockFeedback[record.feedback_id]).toMatchObject({context: {reply_id: 'a2'}})
    expect(window.gtag.mock.calls).toEqual([['event', FEEDBACK_SUBMITTED_EVENT, expect.objectContaining({
      feedback_source: 'assist_reply', rating: 'up', has_screenshot: 'true', model_choice: 'byok', steps: 3,
      tool_calls: 2})]])
    expect(assistChat.get().messages.find((m) => m.id === 'a2').rating).toBe('up')
  })

  it('a clear sends none of the turn\'s text again, and forgets the rating on the reply', async () => {
    await rateReply({replyId: 'a2', rating: RATINGS.UP})
    const {record} = await rateReply({replyId: 'a2', rating: RATINGS.NONE, screenshot: SCREENSHOT})
    expect(record).toMatchObject({rating: 'none', note: '', screenshot: null, context: {reply: '', prompt: ''}})
    expect(assistChat.get().messages.find((m) => m.id === 'a2').rating).toBeNull()
  })

  it('a reply no longer in the chat sends nothing', async () => {
    expect(await rateReply({replyId: 'gone', rating: RATINGS.UP})).toEqual({ok: false, record: null})
    expect(window.gtag).not.toHaveBeenCalled()
  })
})
