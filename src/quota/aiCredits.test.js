import {AI_CREDIT_ENV_VARS, AI_TIERS, aiCreditLimits, usdToMicro} from './aiCredits'


/* eslint-disable no-magic-numbers */
describe('quota/aiCredits', () => {
  it('converts decimal USD to integer micro-USD exactly', () => {
    expect(usdToMicro('0.02')).toBe(20000)
    expect(usdToMicro('5')).toBe(5000000)
    expect(usdToMicro('0.000001')).toBe(1)
    expect(usdToMicro(' 1.5 ')).toBe(1500000)
  })

  it.each([undefined, '', 'abc', '-1', '1e3', '0.0000001', '1,5'])('treats %j as unset', (value) => {
    expect(usdToMicro(value)).toBeNull()
  })

  it('uses the design doc\'s placeholders when no env is set', () => {
    const limits = aiCreditLimits({})
    expect(limits.budgets).toEqual({[AI_TIERS.ANONYMOUS]: 20000, [AI_TIERS.FREE]: 500000, [AI_TIERS.PRO]: 5000000})
    expect(limits.ipBudget).toBe(100000)
    expect(limits.freeModelRequestsPerDay).toBe(30)
    expect(limits.concurrency).toBe(2)
    expect(limits.maxBodyBytes).toEqual({[AI_TIERS.ANONYMOUS]: 65536, [AI_TIERS.FREE]: 65536})
  })

  it('Pro gets substantially more than free, and free more than anonymous', () => {
    const {budgets} = aiCreditLimits({})
    expect(budgets.pro).toBeGreaterThanOrEqual(budgets.free * 5)
    expect(budgets.free).toBeGreaterThan(budgets.anonymous)
  })

  it('has no default breaker: unset is zero, and says it was unset', () => {
    const limits = aiCreditLimits({})
    expect(limits.breakers).toEqual({anonymous: 0, free: 0})
    expect(limits.breakersConfigured).toEqual({anonymous: false, free: false})
  })

  it('reads every value from its env var', () => {
    const limits = aiCreditLimits({
      AI_BUDGET_ANONYMOUS_USD: '0.05', AI_BUDGET_FREE_USD: '1', AI_BUDGET_PRO_USD: '10',
      AI_BUDGET_IP_USD: '0.2', AI_BREAKER_ANONYMOUS_DAILY_USD: '3', AI_BREAKER_FREE_DAILY_USD: '2.5',
      AI_FREE_MODEL_REQUESTS_PER_DAY: '10', AI_CONCURRENCY_PER_IDENTITY: '4',
      AI_MAX_BODY_BYTES_ANONYMOUS: '32768', AI_MAX_BODY_BYTES_FREE: '131072',
    })
    expect(limits).toEqual({
      budgets: {anonymous: 50000, free: 1000000, pro: 10000000},
      ipBudget: 200000,
      breakers: {anonymous: 3000000, free: 2500000},
      breakersConfigured: {anonymous: true, free: true},
      freeModelRequestsPerDay: 10,
      concurrency: 4,
      maxBodyBytes: {anonymous: 32768, free: 131072},
    })
    expect(AI_CREDIT_ENV_VARS).toHaveLength(10)
  })

  it('a malformed value falls back, never to unlimited', () => {
    const limits = aiCreditLimits({AI_BUDGET_FREE_USD: 'lots', AI_BREAKER_ANONYMOUS_DAILY_USD: 'Infinity',
      AI_CONCURRENCY_PER_IDENTITY: '0'})
    expect(limits.budgets.free).toBe(500000)
    expect(limits.breakers.anonymous).toBe(0)
    expect(limits.concurrency).toBe(1)
  })
})
