import {gtagFunnelEvent} from '../../privacy/analytics'
import {resetAssistQuotaTracking, trackAssistQuotaLimit} from './trackAssistQuota'


jest.mock('../../privacy/analytics', () => ({
  ...jest.requireActual('../../privacy/analytics'),
  gtagFunnelEvent: jest.fn(),
}))


describe('Bot/trackAssistQuota', () => {
  beforeEach(() => {
    resetAssistQuotaTracking()
    jest.mocked(gtagFunnelEvent).mockClear()
  })

  it('sends the funnel\'s quota_limit_reached with the AI credits feature and the tier, nothing else', () => {
    trackAssistQuotaLimit('anonymous')
    expect(gtagFunnelEvent).toHaveBeenCalledWith('quota_limit_reached', {tier: 'anonymous', feature: 'ai_credits'})
  })

  it('once per page per tier', () => {
    trackAssistQuotaLimit('free')
    trackAssistQuotaLimit('free')
    trackAssistQuotaLimit('pro')
    expect(jest.mocked(gtagFunnelEvent).mock.calls.map(([, params]) => params.tier)).toEqual(['free', 'pro'])
  })
})
