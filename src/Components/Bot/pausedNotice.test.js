import {pausedNoticeText} from './pausedNotice'


describe('Bot/pausedNotice', () => {
  const opts = {locale: 'en-US', timeZone: 'America/Los_Angeles'}
  const now = Date.parse('2026-11-20T20:00:00.000Z')

  it('says today\'s credits for a signed-out user, and the clock within a day', () => {
    expect(pausedNoticeText('anonymous', Date.parse('2026-11-21T00:00:03.000Z'), {now, ...opts}))
      .toBe('Paused: today\'s AI credits are used up. Resumes at 4:00 PM.')
  })

  it('says the window for free and Pro, with the day when it is further off', () => {
    const later = Date.parse('2026-12-03T18:30:00.000Z')
    expect(pausedNoticeText('free', later, {now, ...opts}))
      .toBe('Paused: your free AI credits over the last 30 days are used up. Resumes Dec 3, 10:30 AM.')
    expect(pausedNoticeText('pro', later, {now, ...opts})).toMatch(/^Paused: your Pro AI credits over the last 30 days/)
  })

  it('asks for Resume once the time has come in a browser that can\'t forward on its own', () => {
    expect(pausedNoticeText('anonymous', now - 1, {awaitingResume: true, now, ...opts}))
      .toBe('Paused: your AI credits should be back now. Resume to send your message.')
  })
})
