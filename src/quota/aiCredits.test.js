import {AI_CAP_WINDOW_DAYS, AI_CREDIT_ENV_VARS, AI_TIERS, AI_WINDOW_DAYS, aiCreditLimits, usdToMicro} from './aiCredits'


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

  // The owner's PROVISIONAL rates (2026-11-25): a daily rate per tier, the
  // 7-day and period caps multiplied out from it.
  it('uses the provisional daily rates, multiplied out into nested day, 7-day and period caps', () => {
    const limits = aiCreditLimits({})
    expect(AI_CAP_WINDOW_DAYS).toEqual([1, 7, 30])
    expect(AI_WINDOW_DAYS).toEqual({anonymous: 30, free: 30, pro: 30})
    expect(limits.windows).toEqual({
      anonymous: [{days: 1, limit: 10000}, {days: 7, limit: 70000}, {days: 30, limit: 300000}],
      free: [{days: 1, limit: 20000}, {days: 7, limit: 140000}, {days: 30, limit: 600000}],
      pro: [{days: 1, limit: 1000000}, {days: 7, limit: 7000000}, {days: 30, limit: 30000000}],
    })
    // `budgets` is each tier's period cap.
    expect(limits.budgets).toEqual({[AI_TIERS.ANONYMOUS]: 300000, [AI_TIERS.FREE]: 600000, [AI_TIERS.PRO]: 30000000})
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
      AI_BUDGET_ANONYMOUS_DAILY_USD: '0.05', AI_BUDGET_FREE_DAILY_USD: '1', AI_BUDGET_PRO_DAILY_USD: '10',
      AI_BUDGET_FREE_7D_USD: '3', AI_BUDGET_PRO_30D_USD: '100',
      AI_BUDGET_IP_USD: '0.2', AI_BREAKER_ANONYMOUS_DAILY_USD: '3', AI_BREAKER_FREE_DAILY_USD: '2.5',
      AI_FREE_MODEL_REQUESTS_PER_DAY: '10', AI_CONCURRENCY_PER_IDENTITY: '4',
      AI_MAX_BODY_BYTES_ANONYMOUS: '32768', AI_MAX_BODY_BYTES_FREE: '131072',
    })
    expect(limits).toEqual({
      budgets: {anonymous: 1500000, free: 30000000, pro: 100000000},
      windows: {
        anonymous: [{days: 1, limit: 50000}, {days: 7, limit: 350000}, {days: 30, limit: 1500000}],
        // A window's own override wins over the multiple.
        free: [{days: 1, limit: 1000000}, {days: 7, limit: 3000000}, {days: 30, limit: 30000000}],
        pro: [{days: 1, limit: 10000000}, {days: 7, limit: 70000000}, {days: 30, limit: 100000000}],
      },
      ipBudget: 200000,
      breakers: {anonymous: 3000000, free: 2500000},
      breakersConfigured: {anonymous: true, free: true},
      freeModelRequestsPerDay: 10,
      concurrency: 4,
      maxBodyBytes: {anonymous: 32768, free: 131072},
    })
    expect(AI_CREDIT_ENV_VARS).toHaveLength(16)
  })

  it('a malformed value falls back, never to unlimited', () => {
    const limits = aiCreditLimits({AI_BUDGET_FREE_DAILY_USD: 'lots', AI_BUDGET_FREE_30D_USD: 'Infinity',
      AI_BREAKER_ANONYMOUS_DAILY_USD: 'Infinity', AI_CONCURRENCY_PER_IDENTITY: '0'})
    expect(limits.windows.free[0].limit).toBe(20000)
    expect(limits.budgets.free).toBe(600000)
    expect(limits.breakers.anonymous).toBe(0)
    expect(limits.concurrency).toBe(1)
  })
})
