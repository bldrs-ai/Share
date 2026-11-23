import {AI_TIERS, aiCreditLimits} from '../../quota/aiCredits'
import {maxRequestBytesFor} from './assistHost'


describe('viewer/tools/assistHost', () => {
  // Codex on #2305: the relay refuses a body over the caller's tier cap
  // (ai-chat.js maxBodyBytesFor), so the loop sizes each step to it.
  describe('maxRequestBytesFor', () => {
    const {maxBodyBytes} = aiCreditLimits({})

    it('gives the signed-out and free caps the relay enforces', () => {
      expect(maxRequestBytesFor(AI_TIERS.ANONYMOUS)).toBe(maxBodyBytes[AI_TIERS.ANONYMOUS])
      expect(maxRequestBytesFor(AI_TIERS.FREE)).toBe(maxBodyBytes[AI_TIERS.FREE])
      // The default the relay enforces, so a changed default shows up here.
      const DEFAULT_CAP = 65536
      expect(maxRequestBytesFor(AI_TIERS.ANONYMOUS)).toBe(DEFAULT_CAP)
    })

    it('holds the smallest cap until the relay names the tier', () => {
      expect(maxRequestBytesFor(null)).toBe(Math.min(maxBodyBytes[AI_TIERS.ANONYMOUS], maxBodyBytes[AI_TIERS.FREE]))
    })

    it('has none for Pro, whose only cap is the relay\'s technical one', () => {
      expect(maxRequestBytesFor(AI_TIERS.PRO)).toBeUndefined()
    })
  })
})
