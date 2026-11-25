import {PERIOD_MS} from '../../../src/quota/period.js'
import {mintAnonToken, verifyAnonToken} from '../_lib/aiToken.js'
import {
  METERING_TOKEN_PREFIX,
  hashMeteringIp,
  meteringTokenSecret,
  mintMeteringToken,
  verifyMeteringToken,
} from '../_lib/meteringToken.js'
import {hashIp} from '../_lib/aiToken.js'


/* eslint-disable no-magic-numbers */
describe('_lib/meteringToken', () => {
  const SECRET = 'shared-secret'
  const NOW = Date.parse('2026-11-25T10:00:00.000Z')

  it('carries its period: it starts at the mint and lives exactly 30 days', () => {
    const {token, period} = mintMeteringToken(SECRET, NOW)
    expect(token.startsWith(`${METERING_TOKEN_PREFIX}.`)).toBe(true)
    expect(period).toEqual({start: NOW, end: NOW + PERIOD_MS})
    expect(verifyMeteringToken(SECRET, token, NOW + PERIOD_MS - 1000)).toMatchObject({ok: true, period})
    expect(verifyMeteringToken(SECRET, token, NOW + PERIOD_MS)).toEqual({ok: false, reason: 'expired'})
  })

  it('mints unrelated ids, and refuses a forged or foreign token', () => {
    const a = mintMeteringToken(SECRET, NOW)
    const b = mintMeteringToken(SECRET, NOW)
    expect(a.anonId).not.toBe(b.anonId)
    expect(verifyMeteringToken('other', a.token, NOW)).toEqual({ok: false, reason: 'signature'})
    expect(verifyMeteringToken(SECRET, 'bm1.nope', NOW)).toEqual({ok: false, reason: 'malformed'})
    expect(verifyMeteringToken(SECRET, undefined, NOW)).toEqual({ok: false, reason: 'malformed'})
  })

  it('never crosses with the AI relay\'s token or IP hash under one secret', () => {
    const ai = mintAnonToken(SECRET, NOW)
    expect(verifyMeteringToken(SECRET, ai.token, NOW).ok).toBe(false)
    expect(verifyAnonToken(SECRET, mintMeteringToken(SECRET, NOW).token, NOW).ok).toBe(false)
    expect(hashMeteringIp(SECRET, '203.0.113.9', '2026-11-25')).not.toBe(hashIp(SECRET, '203.0.113.9', '2026-11-25'))
  })

  it('salts the IP hash by day, and never returns the IP', () => {
    const today = hashMeteringIp(SECRET, '203.0.113.9', '2026-11-25')
    expect(today).not.toBe(hashMeteringIp(SECRET, '203.0.113.9', '2026-11-26'))
    expect(today).not.toContain('203')
  })

  it('signs with METERING_TOKEN_SECRET, else AI_TOKEN_SECRET', () => {
    expect(meteringTokenSecret({METERING_TOKEN_SECRET: 'm', AI_TOKEN_SECRET: 'a'})).toBe('m')
    expect(meteringTokenSecret({AI_TOKEN_SECRET: 'a'})).toBe('a')
    expect(meteringTokenSecret({})).toBeNull()
  })
})
