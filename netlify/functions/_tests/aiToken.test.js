/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
/*
 * The anonymous assistant token and IP hash (`_lib/aiToken.js`, D5).
 */
import {TOKEN_TTL_SECONDS, hashIp, looksLikeAnonToken, mintAnonToken, verifyAnonToken} from '../_lib/aiToken.js'


/* eslint-disable no-magic-numbers */
const SECRET = 'test-secret-0123456789abcdef'
const NOW = Date.parse('2026-11-18T12:00:00.000Z')


describe('aiToken', () => {
  it('a minted token verifies, and names the anon id it was minted for', () => {
    const {token, anonId} = mintAnonToken(SECRET, NOW)
    expect(looksLikeAnonToken(token)).toBe(true)
    expect(verifyAnonToken(SECRET, token, NOW + 1000)).toEqual({ok: true, anonId})
    expect(anonId).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })

  it('two mints are two identities', () => {
    expect(mintAnonToken(SECRET, NOW).anonId).not.toBe(mintAnonToken(SECRET, NOW).anonId)
  })

  it('refuses a token signed with another secret', () => {
    const {token} = mintAnonToken('another-secret', NOW)
    expect(verifyAnonToken(SECRET, token, NOW)).toEqual({ok: false, reason: 'signature'})
  })

  it('refuses a token whose anon id was swapped for another (the signature covers it)', () => {
    const {token} = mintAnonToken(SECRET, NOW)
    const other = mintAnonToken(SECRET, NOW).anonId
    const parts = token.split('.')
    parts[1] = other
    expect(verifyAnonToken(SECRET, parts.join('.'), NOW)).toEqual({ok: false, reason: 'signature'})
  })

  it('refuses a token whose issue time was moved forward to extend it', () => {
    const {token} = mintAnonToken(SECRET, NOW)
    const parts = token.split('.')
    parts[2] = String(Number(parts[2]) + 3600)
    expect(verifyAnonToken(SECRET, parts.join('.'), NOW)).toEqual({ok: false, reason: 'signature'})
  })

  it('expires after one anonymous window', () => {
    const {token} = mintAnonToken(SECRET, NOW)
    expect(verifyAnonToken(SECRET, token, NOW + ((TOKEN_TTL_SECONDS - 1) * 1000)).ok).toBe(true)
    expect(verifyAnonToken(SECRET, token, NOW + (TOKEN_TTL_SECONDS * 1000))).toEqual({ok: false, reason: 'expired'})
  })

  it('refuses one from the future, past clock skew', () => {
    const {token} = mintAnonToken(SECRET, NOW + (10 * 60 * 1000))
    expect(verifyAnonToken(SECRET, token, NOW)).toEqual({ok: false, reason: 'expired'})
  })

  it.each([
    ['', 'empty'],
    ['eyJhbGciOiJSUzI1NiJ9.e30.sig', 'an Auth0 JWT'],
    ['ba1.short.1.sig', 'a short anon id'],
    ['ba1.AAAAAAAAAAAAAAAAAAAAAA.notanumber.sig', 'a bad timestamp'],
  ])('refuses %j (%s) as malformed', (token) => {
    expect(verifyAnonToken(SECRET, token, NOW)).toEqual({ok: false, reason: 'malformed'})
  })

  it('tells an anonymous token from an Auth0 one by its prefix', () => {
    expect(looksLikeAnonToken('eyJhbGciOiJSUzI1NiJ9.e30.sig')).toBe(false)
    expect(looksLikeAnonToken(undefined)).toBe(false)
  })

  it('hashes an IP per day: stable within a day, unlinkable across days, never the IP', () => {
    const today = hashIp(SECRET, '203.0.113.7', '2026-11-18')
    expect(hashIp(SECRET, '203.0.113.7', '2026-11-18')).toBe(today)
    expect(hashIp(SECRET, '203.0.113.7', '2026-11-19')).not.toBe(today)
    expect(hashIp(SECRET, '203.0.113.8', '2026-11-18')).not.toBe(today)
    expect(hashIp('other-secret', '203.0.113.7', '2026-11-18')).not.toBe(today)
    expect(today).toMatch(/^[0-9a-f]{32}$/)
    expect(today).not.toContain('203')
  })
})
