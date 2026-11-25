import {isFeatureEnabled} from '../FeatureFlags'
import {
  METER_LINKED_KEY,
  METER_TOKEN_KEY,
  anonRemoteLoadKey,
  gateAnonRemoteLoad,
  isAnonMeteringEnabled,
  linkAnonMeter,
  mayBeAnonRemoteLoad,
  meterAnonRemoteLoad,
} from './anonMeter'


/* eslint-disable no-magic-numbers */
jest.mock('../FeatureFlags', () => ({isFeatureEnabled: jest.fn()}))


/**
 * @param {number} status
 * @param {object} body
 * @return {Function} a fetch answering that, recording its calls
 */
function answering(status, body) {
  return jest.fn(() => Promise.resolve({ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body)}))
}


const GH = {kind: 'provider', provider: 'github', org: 'someone', repo: 'models', branch: 'main', filepath: 'a.ifc'}


describe('quota/anonMeter', () => {
  beforeEach(() => {
    window.localStorage.clear()
    jest.mocked(isFeatureEnabled).mockImplementation((name) => name === 'quotas')
  })

  it('is on with quotas, and off with its kill switch', () => {
    expect(isAnonMeteringEnabled()).toBe(true)
    jest.mocked(isFeatureEnabled).mockImplementation(() => true)
    expect(isAnonMeteringEnabled()).toBe(false)
    jest.mocked(isFeatureEnabled).mockImplementation(() => false)
    expect(isAnonMeteringEnabled()).toBe(false)
  })

  it('keys GitHub by its share path, and leaves hosted and local models unmetered', async () => {
    expect(await anonRemoteLoadKey(GH, '/share')).toBe('/share/v/gh/someone/models/main/a.ifc')
    expect(await anonRemoteLoadKey({kind: 'file', filepath: 'index.ifc'}, '/share')).toBeNull()
    expect(await anonRemoteLoadKey(null, '/share')).toBeNull()
    expect(mayBeAnonRemoteLoad(GH)).toBe(true)
    expect(mayBeAnonRemoteLoad({kind: 'file'})).toBe(false)
  })

  it('stores the token only once the server issues one, and sends it back', async () => {
    const first = answering(200, {allowed: true, used: 1, notice: null, token: 'bm1.t'})
    expect(await meterAnonRemoteLoad('/share/v/g/x', first)).toEqual({open: true, notice: null, gate: null})
    expect(window.localStorage.getItem(METER_TOKEN_KEY)).toBe('bm1.t')
    expect(first.mock.calls[0][1].headers['x-bldrs-meter-token']).toBeUndefined()

    const second = answering(200, {allowed: true, used: 2, notice: 'last_free'})
    expect(await meterAnonRemoteLoad('/share/v/g/y', second)).toEqual({open: true, notice: 'last_free', gate: null,
      periodEnd: null})
    expect(second.mock.calls[0][1].headers['x-bldrs-meter-token']).toBe('bm1.t')
    expect(JSON.parse(second.mock.calls[0][1].body)).toEqual({action: 'remote_load', key: '/share/v/g/y'})
  })

  it('refuses a gated load with its gate', async () => {
    const gated = answering(403, {allowed: false, gate: 'sign_in', gatedBy: 'token', used: 2, limit: 2,
      periodEnd: '2026-12-25T00:00:00.000Z'})
    expect(await meterAnonRemoteLoad('/share/v/g/z', gated)).toEqual({open: false, notice: null,
      gate: {gatedBy: 'token', used: 2, limit: 2, periodEnd: '2026-12-25T00:00:00.000Z'}})
  })

  it('fails open on a 5xx or a network error', async () => {
    expect((await meterAnonRemoteLoad('/share/v/g/z', answering(503, {error: 'meter_unavailable'}))).open).toBe(true)
    expect((await meterAnonRemoteLoad('/share/v/g/z', () => Promise.reject(new Error('offline')))).open).toBe(true)
  })

  it('opens a sample without asking the meter', async () => {
    const fetch = answering(200, {})
    const sample = {kind: 'provider', provider: 'github', org: 'Swiss-Property-AG', repo: 'Momentum-Public',
      branch: 'main', filepath: 'Momentum.ifc'}
    expect((await gateAnonRemoteLoad(sample, '/share', fetch)).open).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })

  describe('linkAnonMeter', () => {
    it('does nothing without a token', async () => {
      const fetch = answering(200, {})
      expect(await linkAnonMeter(() => Promise.resolve('at'), fetch)).toBeNull()
      expect(fetch).not.toHaveBeenCalled()
    })

    it('links the held token once, with the account\'s bearer', async () => {
      window.localStorage.setItem(METER_TOKEN_KEY, 'bm1.t')
      const fetch = answering(200, {merged: true, carried: {remote_load: {count: 2, stage: 'gated'}}})
      expect(await linkAnonMeter(() => Promise.resolve('at'), fetch)).toMatchObject({merged: true})
      expect(fetch.mock.calls[0][1].headers).toMatchObject({'authorization': 'Bearer at', 'x-bldrs-meter-token': 'bm1.t'})
      expect(window.localStorage.getItem(METER_LINKED_KEY)).toBe('bm1.t')
      // The token is kept for after a sign-out.
      expect(window.localStorage.getItem(METER_TOKEN_KEY)).toBe('bm1.t')
      expect(await linkAnonMeter(() => Promise.resolve('at'), fetch)).toBeNull()
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('tries again after a failure', async () => {
      window.localStorage.setItem(METER_TOKEN_KEY, 'bm1.t')
      expect(await linkAnonMeter(() => Promise.resolve('at'), answering(503, {}))).toBeNull()
      expect(window.localStorage.getItem(METER_LINKED_KEY)).toBeNull()
    })
  })
})
