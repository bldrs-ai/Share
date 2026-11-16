import {readFileSync} from 'fs'
import path from 'path'
import Cookies from 'js-cookie'
import {CONSENT_DEFAULT, CONSENT_GRANTED, GA_CONFIG, GA_MEASUREMENT_ID} from '../index/ga'
import {
  CONSENT_COOKIE_NAME,
  CONSENT_LEVELS,
  CONSENT_VERSION,
  allowsAnalytics,
  consentCookieValue,
  defaultConsentLevel,
  getConsentLevel,
  isConsentDecided,
  setConsentLevel,
} from './consent'


beforeEach(() => {
  // tools/jest/setupTests.js starts every test consented; these start
  // from a visitor who hasn't chosen.
  Cookies.remove(CONSENT_COOKIE_NAME)
  Cookies.remove('isAnalyticsAllowed')
})


describe('getConsentLevel', () => {
  test('is null, not consented, for a visitor who has not chosen', () => {
    expect(getConsentLevel()).toBeNull()
    expect(isConsentDecided()).toBe(false)
  })

  test.each(Object.values(CONSENT_LEVELS))('round-trips %s', (level) => {
    setConsentLevel(level)
    expect(getConsentLevel()).toBe(level)
    expect(isConsentDecided()).toBe(true)
  })

  // An older version reads as undecided, which re-asks.
  test.each([
    `${CONSENT_VERSION - 1}.functional`,
    'functional',
    `${CONSENT_VERSION}.everything`,
    `${CONSENT_VERSION}.`,
    'true',
  ])('treats %p as undecided', (raw) => {
    Cookies.set(CONSENT_COOKIE_NAME, raw)
    expect(getConsentLevel()).toBeNull()
  })

  test('does not read the legacy boolean cookie as consent', () => {
    Cookies.set('isAnalyticsAllowed', 'true')
    expect(getConsentLevel()).toBeNull()
  })
})


describe('setConsentLevel', () => {
  test('deletes the legacy cookie', () => {
    Cookies.set('isAnalyticsAllowed', 'true')
    setConsentLevel(CONSENT_LEVELS.RESTRICTED)
    expect(Cookies.get('isAnalyticsAllowed')).toBeUndefined()
  })

  test('rejects an unknown level', () => {
    expect(() => setConsentLevel('everything')).toThrow()
    expect(getConsentLevel()).toBeNull()
  })
})


describe('allowsAnalytics', () => {
  test('only functional and public allow GA', () => {
    expect(allowsAnalytics(null)).toBe(false)
    expect(allowsAnalytics(CONSENT_LEVELS.RESTRICTED)).toBe(false)
    expect(allowsAnalytics(CONSENT_LEVELS.FUNCTIONAL)).toBe(true)
    expect(allowsAnalytics(CONSENT_LEVELS.PUBLIC)).toBe(true)
  })
})


describe('defaultConsentLevel', () => {
  test('starts the slider at Functional', () => {
    expect(defaultConsentLevel({gpc: false})).toBe(CONSENT_LEVELS.FUNCTIONAL)
  })

  test('starts at Browse only for a browser sending Global Privacy Control', () => {
    expect(defaultConsentLevel({gpc: true})).toBe(CONSENT_LEVELS.RESTRICTED)
  })
})


/*
 * public/index.html's inline stub decides consent before the bundle loads,
 * so it duplicates the cookie rule and the Consent Mode objects. Run the
 * real stub, from the real file, against cookies this module wrote.
 */
describe('index.html gtag stub', () => {
  const html = readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8')
  const stub = [...html.matchAll(/<script type="application\/javascript">([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .find((body) => body.includes('gtag(\'consent\', \'default\''))

  /** @return {Array} the dataLayer after running the stub, as [command, arg, params] */
  function runStub() {
    delete window.dataLayer
    new Function(stub)()
    return window.dataLayer.map((entry) => [entry[0], entry[1], entry[2]])
  }

  test('was found in public/index.html', () => {
    expect(stub).toBeDefined()
  })

  test('queues the consent default first, before any config', () => {
    setConsentLevel(CONSENT_LEVELS.FUNCTIONAL)
    const commands = runStub()
    expect(commands[1]).toEqual(['consent', 'default', CONSENT_DEFAULT])
    expect(commands.findIndex(([cmd]) => cmd === 'config')).toBeGreaterThan(1)
  })

  test.each([
    ['no choice', null],
    ['Browse only', CONSENT_LEVELS.RESTRICTED],
  ])('queues no config and no grant for %s', (_, level) => {
    if (level) {
      setConsentLevel(level)
    }
    const commands = runStub()
    expect(commands.filter(([cmd]) => cmd === 'config')).toHaveLength(0)
    expect(commands.filter(([cmd, arg]) => cmd === 'consent' && arg === 'update')).toHaveLength(0)
  })

  test('queues no config for a choice made under an older consent version', () => {
    Cookies.set(CONSENT_COOKIE_NAME, `${CONSENT_VERSION - 1}.functional`)
    expect(runStub().filter(([cmd]) => cmd === 'config')).toHaveLength(0)
  })

  test.each([CONSENT_LEVELS.FUNCTIONAL, CONSENT_LEVELS.PUBLIC])('grants, then configs, for %s', (level) => {
    setConsentLevel(level)
    expect(consentCookieValue(level)).toBe(Cookies.get(CONSENT_COOKIE_NAME))
    const commands = runStub()
    const updateAt = commands.findIndex(([cmd, arg]) => cmd === 'consent' && arg === 'update')
    expect(commands[updateAt][2]).toEqual(CONSENT_GRANTED)
    const configAt = commands.findIndex(([cmd]) => cmd === 'config')
    expect(configAt).toBeGreaterThan(updateAt)
    expect(commands[configAt][1]).toBe(GA_MEASUREMENT_ID)
    expect(commands[configAt][2]).toEqual(GA_CONFIG)
  })

  test('carries the _ga client id as a user property only for a consenting visitor', () => {
    Cookies.set('_ga', 'GA1.1.1234567890.0987654321')
    setConsentLevel(CONSENT_LEVELS.FUNCTIONAL)
    const config = runStub().find(([cmd]) => cmd === 'config')
    expect(config[2]).toEqual({...GA_CONFIG, user_properties: {open_cid: 'cid.1234567890.0987654321'}})
    Cookies.remove('_ga')
  })
})
