import {registerInMemoryUpload, resetInMemoryUploadsForTest} from '../loader/inMemoryUploads'
import {WITHHELD_MODEL_NAME} from '../privacy/sentryRedaction'
import {PRIVATE_ROUTE, SCREENSHOT, setFeedbackStore} from './feedback.fixture'
import {FEEDBACK_SOURCES, isFeedbackRecord} from './feedbackRecord'
import {
  FEEDBACK_FAILED_EVENT,
  FEEDBACK_SUBMITTED_EVENT,
  RATINGS,
  buildFeedbackRecord,
  feedbackGaParams,
  postFeedback,
  submitFeedback,
} from './submitFeedback'


/* eslint-disable no-magic-numbers */
const ASSIST_CONTEXT = Object.freeze({reply_id: 'a2', reply: 'Looking in tower b.ifc.\n\nSelected 2 walls.',
  prompt: 'select the walls in Tower B.ifc', model_choice: 'byok', steps: 3, tool_calls: 2})

const ASSIST = Object.freeze({source: FEEDBACK_SOURCES.ASSIST_REPLY, rating: RATINGS.DOWN, context: ASSIST_CONTEXT})
const GENERAL = Object.freeze({source: FEEDBACK_SOURCES.GENERAL, note: 'The cut plane is hard to find'})

// Text that must never reach GA, from any field of either source.
const TEXTS = ['Wrong walls', 'Selected 2 walls', 'select the walls', 'Tower', 'acme', 'cut plane', 'base64']


/** @return {Array<object>} the params of each feedback_submitted sent */
function submitted() {
  return window.gtag.mock.calls.filter(([, name]) => name === FEEDBACK_SUBMITTED_EVENT).map(([, , params]) => params)
}


describe('feedback/submitFeedback', () => {
  beforeEach(() => {
    window.gtag = jest.fn()
    window.__mockFeedback = {}
    window.__mockFeedbackFail = false
    setFeedbackStore()
  })

  afterEach(() => {
    delete window.gtag
  })

  describe('buildFeedbackRecord', () => {
    it.each([['assistant', ASSIST], ['general', GENERAL]])('builds a %s record the function accepts', (_, feedback) => {
      expect(isFeedbackRecord(buildFeedbackRecord({...feedback, screenshot: SCREENSHOT}))).toBe(true)
      expect(isFeedbackRecord(buildFeedbackRecord(feedback))).toBe(true)
    })

    it('carries the screenshot only when one was attached', () => {
      expect(buildFeedbackRecord({...ASSIST, screenshot: SCREENSHOT}).screenshot).toBe(SCREENSHOT)
      expect(buildFeedbackRecord(ASSIST).screenshot).toBeNull()
    })

    it('withholds a private model\'s names from the note and the source\'s text fields', () => {
      setFeedbackStore({modelPath: PRIVATE_ROUTE})
      const record = buildFeedbackRecord({...ASSIST, note: 'Acme HQ is wrong'})
      expect(record.context.reply).toBe(`Looking in ${WITHHELD_MODEL_NAME}.\n\nSelected 2 walls.`)
      expect(record.context.prompt).toBe(`select the walls in ${WITHHELD_MODEL_NAME}`)
      expect(record.note).toBe(`${WITHHELD_MODEL_NAME} is wrong`)
      expect(JSON.stringify(record)).not.toMatch(/Tower|acme/i)
    })

    // Codex on #2313: an upload's route holds only its storage UUID, and its
    // root label is composed, `Scene (Secret.glb)`; the bare file name and
    // its stem must be withheld too.
    it.each([
      ['a composed root label', 'Scene (Secret.glb)'],
      // So the upload's own name is checked on its own, not through the label.
      ['a root label without it', 'Model'],
    ])('withholds a local upload\'s original file name and stem, which its route does not carry, under %s', (_, label) => {
      const storageId = registerInMemoryUpload(new File(['glb'], 'Secret.glb'), 'glb')
      try {
        setFeedbackStore({
          modelPath: {kind: 'file', isUploadedFile: true, filepath: `/${storageId}`,
            downloadUrl: new URL(`https://bldrs.ai/${storageId}`)},
          rootElement: {expressID: 1, Name: {value: label}, children: []},
        })
        const record = buildFeedbackRecord({...ASSIST, note: 'Secret.glb looks off', context: {...ASSIST_CONTEXT,
          prompt: 'how big is Secret?', reply: 'Secret.glb has 3 meshes. secret is 2 m tall.'}})
        expect(record.note).toBe(`${WITHHELD_MODEL_NAME} looks off`)
        expect(record.context.prompt).toBe(`how big is ${WITHHELD_MODEL_NAME}?`)
        expect(record.context.reply).toBe(`${WITHHELD_MODEL_NAME} has 3 meshes. ${WITHHELD_MODEL_NAME} is 2 m tall.`)
        expect(record.view.model).toMatchObject({route_kind: 'local', ref: null})
        expect(JSON.stringify(record)).not.toMatch(/secret/i)
      } finally {
        resetInMemoryUploadsForTest()
      }
    })

    it('keeps a hosted sample\'s text as written', () => {
      expect(buildFeedbackRecord(ASSIST).context.prompt).toBe('select the walls in Tower B.ifc')
    })

    it('a clear carries no note or screenshot, and the tier is the sign-in tier', () => {
      setFeedbackStore({appMetadata: {subscriptionStatus: 'sharePro'}})
      const record = buildFeedbackRecord({...ASSIST, rating: RATINGS.NONE, note: 'ignored', screenshot: SCREENSHOT,
        context: {...ASSIST_CONTEXT, reply: '', prompt: ''}, isAuthenticated: true})
      expect(isFeedbackRecord(record)).toBe(true)
      expect(record).toMatchObject({rating: 'none', note: '', screenshot: null, tier: 'pro'})
    })

    it('gives each record its own feedback_id, and refuses an unknown source', () => {
      expect(buildFeedbackRecord(GENERAL).feedback_id).not.toBe(buildFeedbackRecord(GENERAL).feedback_id)
      expect(() => buildFeedbackRecord({source: 'elsewhere'})).toThrow('unknown feedback source')
    })
  })

  describe('feedbackGaParams', () => {
    it('the assistant\'s: the generic fields and its structured extras, nothing else', () => {
      setFeedbackStore({modelPath: PRIVATE_ROUTE})
      const record = buildFeedbackRecord({...ASSIST, note: 'Wrong walls in Tower B.ifc', screenshot: SCREENSHOT})
      expect(feedbackGaParams(record)).toEqual({feedback_id: record.feedback_id, feedback_source: 'assist_reply',
        rating: 'down', has_note: 'true', has_screenshot: 'true', tier: 'anon', source: 'hosted', route_kind: 'github',
        model_choice: 'byok', steps: 3, tool_calls: 2})
    })

    it('general: no rating, no extras', () => {
      const record = buildFeedbackRecord(GENERAL)
      expect(feedbackGaParams(record)).toEqual({feedback_id: record.feedback_id, feedback_source: 'general',
        has_note: 'true', has_screenshot: 'false', tier: 'anon', source: 'hosted', route_kind: 'project'})
    })

    it.each([['assistant', ASSIST], ['general', GENERAL]])('%s: carries no text and no screenshot', (_, feedback) => {
      setFeedbackStore({modelPath: PRIVATE_ROUTE})
      const params = feedbackGaParams(buildFeedbackRecord({...feedback, note: 'Wrong walls', screenshot: SCREENSHOT}))
      const sent = JSON.stringify(params)
      for (const text of TEXTS) {
        expect(sent).not.toContain(text)
      }
      // A boolean, and only that, says whether there was a screenshot.
      expect(params.has_screenshot).toBe('true')
      expect(Object.values(params).every((v) => typeof v === 'number' || String(v).length <= 40)).toBe(true)
    })
  })

  it('submitFeedback: one feedback_submitted, and the record stored under its id', async () => {
    const {ok, record} = await submitFeedback({...ASSIST, note: 'good', screenshot: SCREENSHOT})
    expect(ok).toBe(true)
    expect(submitted()).toEqual([expect.objectContaining({feedback_id: record.feedback_id, has_screenshot: 'true'})])
    expect(window.__mockFeedback[record.feedback_id]).toMatchObject({source: 'assist_reply', note: 'good',
      screenshot: SCREENSHOT, context: {reply: ASSIST_CONTEXT.reply}})
  })

  it('submitFeedback works for the general source the same way', async () => {
    const {ok, record} = await submitFeedback(GENERAL)
    expect(ok).toBe(true)
    expect(window.__mockFeedback[record.feedback_id]).toMatchObject({source: 'general', rating: null, context: {}})
  })

  it('postFeedback: a refused post is counted as feedback_failed, with no text', async () => {
    window.__mockFeedbackFail = true
    const record = buildFeedbackRecord({...ASSIST, note: 'secret note'})
    expect(await postFeedback(record)).toBe(false)
    expect(window.gtag.mock.calls).toEqual([['event', FEEDBACK_FAILED_EVENT,
      {feedback_source: 'assist_reply', stage: 'send', reason: 'http', status: 502, feedback_id: record.feedback_id}]])
  })

  it('postFeedback: a network failure is counted as such', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    try {
      const record = buildFeedbackRecord(GENERAL)
      expect(await postFeedback(record)).toBe(false)
      expect(window.gtag.mock.calls[0][2]).toEqual({feedback_source: 'general', stage: 'send', reason: 'network',
        feedback_id: record.feedback_id})
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
