import {
  UnsupportedSchemaError,
  conwayRefusedSchema,
  nextModelID,
  openModelFailure,
} from './unsupportedSchema'


/**
 * A minimal Part-21 file whose header names `schema`.
 *
 * @param {string} schema FILE_SCHEMA value
 * @return {string}
 */
function part21(schema) {
  return [
    'ISO-10303-21;',
    'HEADER;',
    'FILE_DESCRIPTION((\'ViewDefinition [CoordinationView]\'),\'2;1\');',
    'FILE_NAME(\'road.ifc\',\'2026-09-25T00:00:00\',(\'\'),(\'\'),\'\',\'\',\'\');',
    `FILE_SCHEMA(('${schema}'));`,
    'ENDSEC;',
    'DATA;',
    '#1=IFCPROJECT(\'0YvctVUKr0kugbFTf53O9L\',$,\'P\',$,$,$,$,$,$);',
    'ENDSEC;',
    'END-ISO-10303-21;',
  ].join('\n')
}


const bytes = (text) => new TextEncoder().encode(text)


describe('loader/unsupportedSchema — openModelFailure', () => {
  it('names an IFC4X3 schema instead of the raw -1, from a Uint8Array', async () => {
    const err = await openModelFailure(-1, bytes(part21('IFC4X3_RC2')), true)
    expect(err).toBeInstanceOf(UnsupportedSchemaError)
    expect(err.schema).toBe('IFC4X3_RC2')
    expect(err.message).toMatch(/IFC4X3_RC2 \(IFC 4\.3\)/)
    expect(err.message).not.toMatch(/OpenModel returned/)
    expect(err.message).toMatch(/not this one yet/)
  })

  it('reads the header from an ArrayBuffer source', async () => {
    const err = await openModelFailure(-1, bytes(part21('IFC4X3_ADD2')).buffer, true)
    expect(err).toBeInstanceOf(UnsupportedSchemaError)
    expect(err.schema).toBe('IFC4X3_ADD2')
  })

  it('reads the header from a Blob source, which is what a store-backed open passes', async () => {
    // A spelling distinct from the unreadable-header fallback ('IFC4X3'),
    // so this passes only if the Blob's header was actually read.
    const err = await openModelFailure(-1, new Blob([part21('IFC4X3_RC4')]), true)
    expect(err).toBeInstanceOf(UnsupportedSchemaError)
    expect(err.schema).toBe('IFC4X3_RC4')
  })

  // The header only NAMES the schema; conway's own refusal signal decides.
  // A failed load of an IFC4X3 file conway supports (corrupt bytes, an
  // engine regression) must keep the generic error Sentry groups engine
  // failures by (codex review of Share#1875).
  it('keeps the generic open error for an IFC4X3 file conway did not refuse', async () => {
    const err = await openModelFailure(-1, bytes(part21('IFC4X3_RC2')), false)
    expect(err).not.toBeInstanceOf(UnsupportedSchemaError)
    expect(err.message).toBe('parseIfcWithConway: OpenModel returned -1')
  })

  it('keeps the generic open error for an IFC4 file', async () => {
    const err = await openModelFailure(-1, bytes(part21('IFC4')), false)
    expect(err).not.toBeInstanceOf(UnsupportedSchemaError)
    expect(err.message).toBe('parseIfcWithConway: OpenModel returned -1')
  })

  it('names the family when conway refused but the header cannot be read', async () => {
    const err = await openModelFailure(undefined, {not: 'a source'}, true)
    expect(err).toBeInstanceOf(UnsupportedSchemaError)
    expect(err.schema).toBe('IFC4X3')
  })

  // A refusal is only ever IFC4X3; a header naming anything else is not
  // trusted as the name.
  it('does not name a non-4x3 header schema in a refusal', async () => {
    const err = await openModelFailure(-1, bytes(part21('IFC4')), true)
    expect(err.schema).toBe('IFC4X3')
  })

  // `stepSchemaName` reads the HEADER section only, so a 4x3 name appearing
  // in DATA (a property string, say) must not relabel an IFC4 file.
  it('does not take an IFC4X3 string outside the header as the name', async () => {
    const text = part21('IFC4').replace(
      '#1=IFCPROJECT(', '#2=IFCLABEL(\'FILE_SCHEMA((\'IFC4X3_ADD2\'))\');\n#1=IFCPROJECT(')
    const err = await openModelFailure(-1, bytes(text), true)
    expect(err.schema).toBe('IFC4X3')
  })
})


describe('loader/unsupportedSchema — conway refusal signal', () => {
  const api = (status, counter = 7) => ({
    globalModelIDCounter: counter,
    getStatistics: jest.fn((id) => (id === counter ? {getLoadStatus: () => status} : undefined)),
  })

  it('reads the next model id from the engine counter', () => {
    expect(nextModelID(api('OK', 3))).toBe(3)
    expect(nextModelID({})).toBeUndefined()
  })

  it('is a refusal only when conway recorded UNSUPPORTED_SCHEMA for the attempted id', () => {
    expect(conwayRefusedSchema(api('UNSUPPORTED_SCHEMA'), 7)).toBe(true)
    expect(conwayRefusedSchema(api('OK'), 7)).toBe(false)
    expect(conwayRefusedSchema(api('UNSUPPORTED_SCHEMA'), 8)).toBe(false)
  })

  it('is never a refusal on an engine without statistics, or without an attempted id', () => {
    expect(conwayRefusedSchema({}, 7)).toBe(false)
    expect(conwayRefusedSchema(api('UNSUPPORTED_SCHEMA'), undefined)).toBe(false)
    expect(conwayRefusedSchema({getStatistics: () => {
      throw new Error('boom')
    }}, 7)).toBe(false)
  })
})
