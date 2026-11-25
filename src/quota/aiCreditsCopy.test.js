import {aiCreditsCopy} from './aiCreditsCopy'


describe('quota/aiCreditsCopy', () => {
  it('signed out: sign in; free: upgrade; Pro: wait, with nothing to buy', () => {
    expect(aiCreditsCopy('anonymous')).toMatchObject({cta: 'sign-in', ctaLabel: 'Sign in', windowLabel: 'for now'})
    expect(aiCreditsCopy('free')).toMatchObject({cta: 'subscribe', ctaLabel: 'Upgrade to Pro'})
    expect(aiCreditsCopy('pro')).toMatchObject({cta: null, ctaLabel: null})
  })

  // Nested caps (aiCredits.js): any of the day, the week or the period may
  // be the one refusing, so no tier's copy names one window.
  it('names no single window, since any of the nested caps may be the one reached', () => {
    for (const tier of ['anonymous', 'free', 'pro']) {
      expect(aiCreditsCopy(tier).windowLabel).toBe('for now')
      expect(aiCreditsCopy(tier).body).not.toMatch(/today|last \d+ days/)
    }
  })

  it('words an unknown or missing tier as signed out, and never shows a dollar', () => {
    expect(aiCreditsCopy(undefined)).toEqual(aiCreditsCopy('anonymous'))
    expect(aiCreditsCopy('mystery')).toEqual(aiCreditsCopy('anonymous'))
    for (const tier of ['anonymous', 'free', 'pro']) {
      expect(aiCreditsCopy(tier).body).not.toMatch(/\$/)
    }
  })
})
