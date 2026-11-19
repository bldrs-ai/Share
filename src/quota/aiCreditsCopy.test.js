import {AI_WINDOW_DAYS} from './aiCredits'
import {aiCreditsCopy} from './aiCreditsCopy'


describe('quota/aiCreditsCopy', () => {
  it('signed out: sign in; free: upgrade; Pro: wait, with nothing to buy', () => {
    expect(aiCreditsCopy('anonymous')).toMatchObject({cta: 'sign-in', ctaLabel: 'Sign in', windowLabel: 'today'})
    expect(aiCreditsCopy('free')).toMatchObject({cta: 'subscribe', ctaLabel: 'Upgrade to Pro'})
    expect(aiCreditsCopy('pro')).toMatchObject({cta: null, ctaLabel: null})
  })

  it('quotes each signed-in tier\'s window from aiCredits.js, not a copy of its own', () => {
    for (const tier of ['free', 'pro']) {
      expect(aiCreditsCopy(tier).body).toContain(`last ${AI_WINDOW_DAYS[tier]} days`)
      expect(aiCreditsCopy(tier).windowLabel).toBe(`over the last ${AI_WINDOW_DAYS[tier]} days`)
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
