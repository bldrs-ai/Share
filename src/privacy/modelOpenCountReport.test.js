import {supportedTypes} from '../Filetype'
import {SIZE_BUCKET_UNKNOWN, bucketFileSize} from '../loader/loadAnalytics'
import {
  MAX_REPORT_BYTES,
  MODEL_OPEN_COUNT_EVENT,
  MODEL_OPEN_COUNT_FIELDS,
  MODEL_OPEN_FORMATS,
  parseModelOpenCountReport,
} from './modelOpenCountReport'


/* eslint-disable no-magic-numbers */
const REPORT = {
  content_type: 'ifc', size_bucket: '10-50mb', source: 'github', open_kind: 'page', form_factor: 'desktop', consent: 'off',
}
const MB = 1024 * 1024


describe('privacy/modelOpenCountReport', () => {
  it('names the event', () => {
    expect(MODEL_OPEN_COUNT_EVENT).toBe('model_open_count')
  })

  // Written out to keep the module import-free; it must not drift from the
  // formats Share opens.
  it('lists exactly Filetype.js#supportedTypes as formats, plus other', () => {
    expect([...MODEL_OPEN_FORMATS]).toEqual(supportedTypes)
    expect(MODEL_OPEN_COUNT_FIELDS.content_type).toEqual([...supportedTypes, 'other'])
  })

  it('has every size bucket load_failed uses', () => {
    const produced = new Set([0.5, 5, 20, 100, 500].map((mb) => bucketFileSize(mb * MB)))
    produced.add(bucketFileSize(undefined))
    expect(produced.has(SIZE_BUCKET_UNKNOWN)).toBe(true)
    expect(new Set(MODEL_OPEN_COUNT_FIELDS.size_bucket)).toEqual(produced)
  })

  it('accepts a report of exactly its fields', () => {
    expect(parseModelOpenCountReport(JSON.stringify(REPORT))).toEqual(REPORT)
    expect(JSON.stringify(REPORT).length).toBeLessThan(MAX_REPORT_BYTES)
  })

  it.each([
    ['not a string', 42],
    ['empty', ''],
    ['not JSON', '{nope'],
    ['an array', '[]'],
    ['null', 'null'],
    ['no fields', '{}'],
    ['a missing field', JSON.stringify({...REPORT, consent: undefined})],
    ['an extra field', JSON.stringify({...REPORT, content_id: 'https://example.com/private.ifc'})],
    ['a field swapped for another', JSON.stringify({...Object.fromEntries(Object.entries(REPORT).slice(1)), file: 'a.ifc'})],
    ['a format outside the enum', JSON.stringify({...REPORT, content_type: 'private.ifc'})],
    ['a raw size', JSON.stringify({...REPORT, size_bucket: 12345})],
    ['a source outside the enum', JSON.stringify({...REPORT, source: 'https://example.com'})],
    ['an oversized body', JSON.stringify({...REPORT, pad: 'x'.repeat(MAX_REPORT_BYTES)})],
  ])('refuses %s', (_, text) => {
    expect(parseModelOpenCountReport(text)).toBeNull()
  })
})
