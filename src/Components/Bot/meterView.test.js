import {LOW_CREDITS_PERCENT, meterView} from './meterView'


const LIMIT = 20000
const AT_LOW_MARK = 16000
const JUST_UNDER_LOW_MARK = 15999
const NEARLY_ALL = 19990
const OVER = 99999
const A_QUARTER = 5000
const LOW_MARK = 80
const FULL = 100
const UNDER_FULL = 99


describe('Bot/meterView', () => {
  const credits = (over) => ({tier: 'anonymous', used: 0, limit: LIMIT, exhausted: false, ...over})

  it('is normal below the low mark, low from it, exhausted when the relay refused', () => {
    expect(meterView(credits({used: 100})).state).toBe('normal')
    expect(meterView(credits({used: AT_LOW_MARK})).state).toBe('low')
    expect(LOW_CREDITS_PERCENT).toBe(LOW_MARK)
    expect(meterView(credits({used: JUST_UNDER_LOW_MARK})).state).toBe('normal')
    expect(meterView(credits({used: 100, exhausted: true})).state).toBe('exhausted')
  })

  it('floors the share and caps it at 100, which alone is still not exhausted', () => {
    expect(meterView(credits({used: NEARLY_ALL})).percent).toBe(UNDER_FULL)
    expect(meterView(credits({used: OVER})).percent).toBe(FULL)
    expect(meterView(credits({used: OVER})).state).toBe('low')
    expect(meterView(credits({used: NEARLY_ALL, exhausted: true})).percent).toBe(FULL)
    expect(meterView(credits({used: 0})).percent).toBe(0)
  })

  it('words the window by tier, in credits and never dollars', () => {
    expect(meterView(credits({used: A_QUARTER})).label).toBe('25% of your free AI credits used')
    expect(meterView(credits({tier: 'free', used: A_QUARTER})).label).toBe('25% of your free AI credits used')
    expect(meterView(credits({tier: 'pro', used: A_QUARTER, exhausted: true})).label)
      .toBe('All of your Pro AI credits used')
    expect(meterView(credits({exhausted: true})).label).toBe('All of your free AI credits used')
    expect(meterView(credits({tier: 'free'})).label).not.toMatch(/\$/)
  })
})
