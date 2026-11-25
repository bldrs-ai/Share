import {SAMPLE_MODELS} from '../Components/Open/sampleModelRoster'
import {supportedTypes} from '../Filetype'
import {
  KNOWN_LOAD_PHASES,
  LOAD_FAILURE_REASONS,
  PHASE_NONE,
  PHASE_OTHER,
  SIZE_BUCKET_UNKNOWN,
  bucketFileSize,
} from '../loader/loadAnalytics'
import {LOAD_OUTCOMES} from '../loader/loadProgress'
import {
  LAST_PHASES,
  MAX_REPORT_BYTES,
  MODEL_OPEN_COUNT_EVENT,
  MODEL_OPEN_COUNT_FIELDS,
  MODEL_OPEN_COUNT_MEASURES,
  MODEL_OPEN_FORMATS,
  REASON_CLASSES,
  SAMPLE_IDS,
  parseModelOpenCountReport,
} from './modelOpenCountReport'


/* eslint-disable no-magic-numbers */
const REPORT = {
  content_type: 'ifc',
  size_bucket: '10-50mb',
  source: 'github',
  sample_id: 'none',
  open_kind: 'page',
  form_factor: 'desktop',
  load_outcome: 'displayed',
  reason_class: 'none',
  last_phase: 'none',
  triangle_bucket: '1m-10m',
  error_bucket: '0',
  warning_bucket: '10-99',
  session_id: '4503599627370497',
  load_ms: 8123,
  first_mesh_ms: 2100,
  open_ms: 5000,
  parse_ms: 3000,
  geometry_ms: 1800,
}
const MB = 1024 * 1024


describe('privacy/modelOpenCountReport', () => {
  it('names the event', () => {
    expect(MODEL_OPEN_COUNT_EVENT).toBe('model_open_count')
  })

  // Each list is written out to keep the module import-free; none may drift
  // from its source.
  it('lists exactly Filetype.js#supportedTypes as formats, plus other', () => {
    expect([...MODEL_OPEN_FORMATS]).toEqual(supportedTypes)
    expect(MODEL_OPEN_COUNT_FIELDS.content_type).toEqual([...supportedTypes, 'other'])
  })

  it('lists exactly the sample roster\'s names as sample ids, plus none', () => {
    expect([...SAMPLE_IDS]).toEqual(SAMPLE_MODELS.map((sample) => sample.name.toLowerCase()))
    expect(MODEL_OPEN_COUNT_FIELDS.sample_id).toEqual([...SAMPLE_IDS, 'none'])
  })

  it('has every size bucket load_failed uses', () => {
    const produced = new Set([0.5, 5, 20, 100, 500].map((mb) => bucketFileSize(mb * MB)))
    produced.add(bucketFileSize(undefined))
    expect(produced.has(SIZE_BUCKET_UNKNOWN)).toBe(true)
    expect(new Set(MODEL_OPEN_COUNT_FIELDS.size_bucket)).toEqual(produced)
  })

  it('has load_failed\'s reason classes and phases, plus none', () => {
    expect(new Set(REASON_CLASSES)).toEqual(new Set([...Object.values(LOAD_FAILURE_REASONS), 'none']))
    expect(new Set(LAST_PHASES)).toEqual(new Set([...KNOWN_LOAD_PHASES, PHASE_NONE, PHASE_OTHER]))
  })

  it('has the load outcomes, plus failed', () => {
    expect(new Set(MODEL_OPEN_COUNT_FIELDS.load_outcome)).toEqual(new Set([...Object.values(LOAD_OUTCOMES), 'failed']))
  })

  it('accepts a full report, and one with no measures', () => {
    expect(parseModelOpenCountReport(JSON.stringify(REPORT))).toEqual(REPORT)
    expect(JSON.stringify(REPORT).length).toBeLessThan(MAX_REPORT_BYTES)
    const bare = Object.fromEntries(Object.entries(REPORT).filter(([key]) => !MODEL_OPEN_COUNT_MEASURES.includes(key)))
    expect(parseModelOpenCountReport(JSON.stringify(bare))).toEqual(bare)
    const failed = {
      ...bare, load_outcome: 'failed', reason_class: 'parse', last_phase: 'dataparse',
      triangle_bucket: 'unknown', error_bucket: 'unknown', warning_bucket: 'unknown',
    }
    expect(parseModelOpenCountReport(JSON.stringify(failed))).toEqual(failed)
  })

  it.each([
    ['not a string', 42],
    ['empty', ''],
    ['not JSON', '{nope'],
    ['an array', '[]'],
    ['null', 'null'],
    ['no fields', '{}'],
    ['a missing field', JSON.stringify({...REPORT, load_outcome: undefined})],
    ['no session id', JSON.stringify({...REPORT, session_id: undefined})],
    ['a numeric session id', JSON.stringify({...REPORT, session_id: 123})],
    ['a session id that is not digits', JSON.stringify({...REPORT, session_id: 'abc-123'})],
    ['a session id with a leading zero', JSON.stringify({...REPORT, session_id: '0123'})],
    ['a session id over 16 digits', JSON.stringify({...REPORT, session_id: '12345678901234567'})],
    ['a content id', JSON.stringify({...REPORT, content_id: 'https://example.com/private.ifc'})],
    ['a client id', JSON.stringify({...REPORT, client_id: '123.456'})],
    ['the dropped consent field', JSON.stringify({...REPORT, consent: 'off'})],
    ['an inherited key name', JSON.stringify({...REPORT, constructor: 1})],
    ['a format outside the enum', JSON.stringify({...REPORT, content_type: 'private.ifc'})],
    ['a sample id outside the roster', JSON.stringify({...REPORT, sample_id: 'secret-plans'})],
    ['a raw size', JSON.stringify({...REPORT, size_bucket: 12345})],
    ['a negative measure', JSON.stringify({...REPORT, load_ms: -1})],
    ['a fractional measure', JSON.stringify({...REPORT, load_ms: 1.5})],
    ['a text measure', JSON.stringify({...REPORT, load_ms: '12'})],
    // Exact counts would fingerprint a private model across visits.
    ['an exact triangle count', JSON.stringify({...REPORT, triangle_count: 1234567})],
    ['an exact vertex count', JSON.stringify({...REPORT, vertex_count: 2345678})],
    ['an exact error count', JSON.stringify({...REPORT, error_count: 3})],
    ['a triangle bucket outside the set', JSON.stringify({...REPORT, triangle_bucket: '1234567'})],
    ['an oversized body', JSON.stringify({...REPORT, pad: 'x'.repeat(MAX_REPORT_BYTES)})],
  ])('refuses %s', (_, text) => {
    expect(parseModelOpenCountReport(text)).toBeNull()
  })
})
