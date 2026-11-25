import {formFactor} from './clientCapabilities'
import {SESSION_ID_PATTERN} from './modelOpenCountReport'
import {
  COUNTRY_UNKNOWN,
  MAX_VISIT_BYTES,
  PAGE_VISIT_EVENT,
  PAGE_VISIT_FIELDS,
  VISIT_SESSION_ID_PATTERN,
  countryParam,
  parsePageVisitReport,
} from './pageVisitReport'


/* eslint-disable no-magic-numbers */
const REPORT = {
  route_kind: 'viewer-github',
  referrer_class: 'search',
  utm_source: 'linkedin',
  utm_medium: 'social',
  form_factor: 'desktop',
  session_id: '4503599627370497',
}


describe('privacy/pageVisitReport', () => {
  it('names the event', () => {
    expect(PAGE_VISIT_EVENT).toBe('page_visit')
  })

  // A visit and its loads join on the session id, so the two must accept the
  // same ids.
  it('accepts exactly model_open_count\'s session ids', () => {
    expect(VISIT_SESSION_ID_PATTERN.source).toBe(SESSION_ID_PATTERN.source)
  })

  it('has every form factor clientCapabilities produces', () => {
    const produced = [formFactor({userAgent: 'iPhone'}), formFactor({userAgent: 'X11; Linux'})]
    expect(new Set(PAGE_VISIT_FIELDS.form_factor)).toEqual(new Set(produced))
  })

  it('accepts a report of exactly its fields', () => {
    expect(parsePageVisitReport(JSON.stringify(REPORT))).toEqual(REPORT)
    expect(JSON.stringify(REPORT).length).toBeLessThan(MAX_VISIT_BYTES)
  })

  it.each([
    ['not a string', 42],
    ['empty', ''],
    ['not JSON', '{nope'],
    ['an array', '[]'],
    ['no fields', '{}'],
    ['a missing field', JSON.stringify({...REPORT, referrer_class: undefined})],
    ['no session id', JSON.stringify({...REPORT, session_id: undefined})],
    ['a session id that is not digits', JSON.stringify({...REPORT, session_id: 'visit-1'})],
    // The country is the function's, from Netlify; the page may not say one.
    ['a country from the page', JSON.stringify({...REPORT, country: 'BR'})],
    ['a path', JSON.stringify({...REPORT, path: '/share/v/gh/someone/private/main/secret.ifc'})],
    ['the referrer itself', JSON.stringify({...REPORT, referrer: 'https://example.com/private'})],
    ['a route kind outside the enum', JSON.stringify({...REPORT, route_kind: '/share/v/gh/o/r'})],
    ['a referrer class outside the enum', JSON.stringify({...REPORT, referrer_class: 'example.com'})],
    ['a free-text campaign', JSON.stringify({...REPORT, utm_source: 'spring-promo-2026'})],
    ['an oversized body', JSON.stringify({...REPORT, pad: 'x'.repeat(MAX_VISIT_BYTES)})],
  ])('refuses %s', (_, text) => {
    expect(parsePageVisitReport(text)).toBeNull()
  })

  it.each([
    ['BR', 'BR'], ['DE', 'DE'],
    [undefined, COUNTRY_UNKNOWN], [null, COUNTRY_UNKNOWN], ['', COUNTRY_UNKNOWN],
    ['br', COUNTRY_UNKNOWN], ['BRA', COUNTRY_UNKNOWN], ['São Paulo', COUNTRY_UNKNOWN], [76, COUNTRY_UNKNOWN],
  ])('keeps the country %p as %p', (code, param) => {
    expect(countryParam(code)).toBe(param)
  })
})
