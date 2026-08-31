import {normalizeMessageDigits} from './messageGrouping'


describe('normalizeMessageDigits', () => {
  it('collapses per-entity ids, whether or not the text spelled the #', () => {
    expect(normalizeMessageDigits('Error processing representation #1204'))
      .toBe('Error processing representation #')
    expect(normalizeMessageDigits('CDT Exception (hemisphere: 0)'))
      .toBe('CDT Exception (hemisphere: #)')
  })

  it('collapses every number in the message, not just the first', () => {
    expect(normalizeMessageDigits('File upload of unknown type: type(3) size(180384)'))
      .toBe('File upload of unknown type: type(#) size(#)')
  })

  // Documented as a cost of the pass being indiscriminate: the schema and
  // authoring tool ride on the event's tags, so losing their digits from the
  // grouping key buys the collapse without losing information.
  it('collapses digits inside identifiers too', () => {
    expect(normalizeMessageDigits('IFC4 model from Revit 2024')).toBe('IFC# model from Revit #')
  })

  it('leaves digit-free text alone', () => {
    expect(normalizeMessageDigits('Failed to parse model')).toBe('Failed to parse model')
  })
})
