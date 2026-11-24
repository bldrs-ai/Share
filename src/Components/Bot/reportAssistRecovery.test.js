import {gtagEvent} from '../../privacy/analytics'
import {reportAssistRecovery} from './reportAssistRecovery'


jest.mock('../../privacy/analytics', () => ({gtagEvent: jest.fn(() => true)}))


describe('Bot/reportAssistRecovery', () => {
  beforeEach(() => gtagEvent.mockClear())

  it('sends assist_request_resized with the tier and the two sizes, and nothing else', () => {
    expect(reportAssistRecovery({type: 'recovered', condition: 'body_resized', fromBytes: 120000, toBytes: 60000,
      tier: 'free', text: 'secret', model: 'm'})).toBe(true)
    expect(gtagEvent).toHaveBeenCalledTimes(1)
    expect(gtagEvent).toHaveBeenCalledWith('assist_request_resized', {tier: 'free', from_bytes: 120000, to_bytes: 60000})
  })

  it('says "unknown" when the relay named no tier', () => {
    reportAssistRecovery({type: 'recovered', condition: 'body_resized', fromBytes: 2, toBytes: 1})
    expect(gtagEvent).toHaveBeenCalledWith('assist_request_resized', {tier: 'unknown', from_bytes: 2, to_bytes: 1})
  })

  it('ignores other events and conditions', () => {
    expect(reportAssistRecovery({type: 'done', finishReason: 'stop'})).toBe(false)
    expect(reportAssistRecovery({type: 'recovered', condition: 'other'})).toBe(false)
    expect(gtagEvent).not.toHaveBeenCalled()
  })
})
