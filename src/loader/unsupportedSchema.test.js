import {UnsupportedSchemaError, openModelFailure} from './unsupportedSchema'


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
    const err = await openModelFailure(-1, bytes(part21('IFC4X3_RC2')))
    expect(err).toBeInstanceOf(UnsupportedSchemaError)
    expect(err.schema).toBe('IFC4X3_RC2')
    expect(err.message).toMatch(/IFC4X3_RC2 \(IFC 4\.3\)/)
    expect(err.message).not.toMatch(/OpenModel returned/)
  })

  it('reads the header from an ArrayBuffer source', async () => {
    const err = await openModelFailure(-1, bytes(part21('IFC4X3_ADD2')).buffer)
    expect(err).toBeInstanceOf(UnsupportedSchemaError)
    expect(err.schema).toBe('IFC4X3_ADD2')
  })

  it('reads the header from a Blob source, which is what a store-backed open passes', async () => {
    const err = await openModelFailure(-1, new Blob([part21('IFC4X3')]))
    expect(err).toBeInstanceOf(UnsupportedSchemaError)
    expect(err.schema).toBe('IFC4X3')
  })

  // The generic message is what Sentry groups genuine engine failures by, and
  // what existing loader tests assert on — it must survive untouched for any
  // schema conway does NOT refuse by design.
  it('keeps the generic open error for an IFC4 file', async () => {
    const err = await openModelFailure(-1, bytes(part21('IFC4')))
    expect(err).not.toBeInstanceOf(UnsupportedSchemaError)
    expect(err.message).toBe('parseIfcWithConway: OpenModel returned -1')
  })

  it('keeps the generic open error for a generic STEP file', async () => {
    const err = await openModelFailure(-1, bytes(part21('AUTOMOTIVE_DESIGN')))
    expect(err).not.toBeInstanceOf(UnsupportedSchemaError)
  })

  it('keeps the generic open error when the header cannot be read', async () => {
    const err = await openModelFailure(undefined, {not: 'a source'})
    expect(err).not.toBeInstanceOf(UnsupportedSchemaError)
    expect(err.message).toBe('parseIfcWithConway: OpenModel returned undefined')
  })

  // `stepSchemaName` reads the HEADER section only, so a 4x3 name appearing
  // in DATA (a property string, say) must not relabel an IFC4 file.
  it('does not trip on an IFC4X3 string outside the header', async () => {
    const text = part21('IFC4').replace(
      '#1=IFCPROJECT(', '#2=IFCLABEL(\'FILE_SCHEMA((\'IFC4X3\'))\');\n#1=IFCPROJECT(')
    const err = await openModelFailure(-1, bytes(text))
    expect(err).not.toBeInstanceOf(UnsupportedSchemaError)
  })
})
