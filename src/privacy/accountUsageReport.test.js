/* eslint-disable no-magic-numbers */
import {
  LOAD_REPORT_FIELDS,
  MAX_ACCOUNT_USAGE_BYTES,
  limitRouteKindOfKey,
  parseAccountUsageBody,
  parseFunnelParams,
  parseLoadReport,
  roundSignificant,
} from './accountUsageReport'
import {MODEL_OPEN_COUNT_FIELDS} from './modelOpenCountReport'


const REPORT = {
  content_type: 'ifc', size_bucket: '1-10mb', source: 'github', open_kind: 'page', form_factor: 'desktop',
  load_outcome: 'displayed', cache_hit: 'false', tier: 'free', loadTime: 2310, firstMeshMs: 880,
}
const body = (value) => JSON.stringify(value)


describe('privacy/accountUsageReport', () => {
  it('shares its enums with the cookieless count (#2355), so the two can never divide opens differently', () => {
    for (const field of ['content_type', 'size_bucket', 'source', 'open_kind', 'form_factor']) {
      expect(LOAD_REPORT_FIELDS[field]).toBe(MODEL_OPEN_COUNT_FIELDS[field])
    }
    expect(LOAD_REPORT_FIELDS).not.toHaveProperty('consent')
  })

  it('accepts a load report of enums and metrics, and keeps it exactly', () => {
    expect(parseAccountUsageBody(body({kind: 'load', report: REPORT}))).toEqual({kind: 'load', report: REPORT})
  })

  it.each([
    ['a file name', {file_name: 'tower.ifc'}],
    ['a content id', {content_id: '/share/v/gh/acme/private/main/tower.ifc'}],
    ['an exact file size', {fileSize: 1234567}],
    ['a fractional metric', {loadTime: 12.5}],
    ['a negative metric', {openMs: -1}],
    ['a metric past the cap', {vertexCount: 1e11}],
    ['a metric as text', {loadTime: '2310'}],
    ['an unknown format', {content_type: 'dwg'}],
    ['an unknown tier', {tier: 'enterprise'}],
  ])('refuses a load report carrying %s', (_, extra) => {
    expect(parseLoadReport({...REPORT, ...extra})).toBeNull()
    expect(parseAccountUsageBody(body({kind: 'load', report: {...REPORT, ...extra}}))).toBeNull()
  })

  // Exact model-size counts would identify a model as a byte count does.
  it('keeps the model-size counts to two significant figures, and the timings exact', () => {
    const parsed = parseLoadReport({...REPORT, vertexCount: 123456, triangleCount: 99, productCount: 1049, loadTime: 2311})
    expect(parsed).toMatchObject({vertexCount: 120000, triangleCount: 99, productCount: 1000, loadTime: 2311})
    expect([0, 7, 95, 999, 12345].map((v) => roundSignificant(v, 2))).toEqual([0, 7, 95, 1000, 12000])
  })

  it('refuses a report key named after an Object.prototype member', () => {
    expect(parseLoadReport({...REPORT, toString: 'tower.ifc'})).toBeNull()
    expect(parseLoadReport(JSON.parse(`{${JSON.stringify(REPORT).slice(1, -1)},"__proto__":"x"}`))).toBeNull()
  })

  it('refuses a load report missing any enum field', () => {
    for (const field of Object.keys(LOAD_REPORT_FIELDS)) {
      const partial = {...REPORT}
      delete partial[field]
      expect(parseLoadReport(partial)).toBeNull()
    }
  })

  it('accepts only the client-decided private-model limit, never an export slot', () => {
    expect(parseAccountUsageBody(body({kind: 'limit', limit: 'private_model', gate: 'blocked', route_kind: 'gdrive'})))
      .toEqual({kind: 'limit', limit: 'private_model', gate: 'blocked', route_kind: 'gdrive'})
    expect(parseAccountUsageBody(body({kind: 'limit', limit: 'private_model', gate: 'soft'})))
      .toEqual({kind: 'limit', limit: 'private_model', gate: 'soft'})
    expect(parseAccountUsageBody(body({kind: 'limit', limit: 'export_slot', gate: 'blocked'}))).toBeNull()
    expect(parseAccountUsageBody(body({kind: 'limit', limit: 'private_model', gate: 'maybe'}))).toBeNull()
    expect(parseAccountUsageBody(body({kind: 'limit', limit: 'private_model', gate: 'blocked', key: '/v/g/x'}))).toBeNull()
  })

  it('accepts funnel steps only with their own enum params', () => {
    expect(parseFunnelParams('login', {method: 'github', from: 'gate', feature: 'share'}))
      .toEqual({method: 'github', from: 'gate', feature: 'share'})
    expect(parseFunnelParams('login', {from: 'gate'})).toBeNull()
    expect(parseFunnelParams('begin_checkout', {from: 'quota', destination: 'checkout'}))
      .toEqual({from: 'quota', destination: 'checkout'})
    expect(parseFunnelParams('begin_checkout', {from: 'quota', destination: 'checkout', email: 'a@b.c'})).toBeNull()
    expect(parseFunnelParams('sign_up', {})).toBeNull()
    expect(parseFunnelParams('constructor', {})).toBeNull()
  })

  it('accepts a preference only as a boolean', () => {
    expect(parseAccountUsageBody(body({kind: 'preference', usage_reports: false}))).toEqual({kind: 'preference', usage_reports: false})
    expect(parseAccountUsageBody(body({kind: 'preference', usage_reports: 'off'}))).toBeNull()
  })

  it('refuses junk: not JSON, not an object, an unknown kind, an oversized body', () => {
    expect(parseAccountUsageBody('')).toBeNull()
    expect(parseAccountUsageBody('{')).toBeNull()
    expect(parseAccountUsageBody('[]')).toBeNull()
    expect(parseAccountUsageBody(body({}))).toBeNull()
    expect(parseAccountUsageBody(body({kind: 'other'}))).toBeNull()
    expect(parseAccountUsageBody(body({kind: 'load', report: REPORT, extra: 1}))).toBeNull()
    expect(parseAccountUsageBody(' '.repeat(MAX_ACCOUNT_USAGE_BYTES + 1))).toBeNull()
  })

  it.each([
    ['/share/v/gh/acme/private/main/tower.ifc', 'github'],
    ['/share/v/g/1AbC', 'gdrive'],
    ['/share/v/local-only/0a1b.ifc', 'local'],
    ['/share/v/new/0a1b.ifc', 'local'],
    ['/share/v/p/index.ifc', null],
    ['/share/v/constructor/x', null],
    ['nonsense', null],
  ])('reduces the key %s to its route kind, %s', (key, kind) => {
    expect(limitRouteKindOfKey(key)).toBe(kind)
  })
})
