import {isConwayIfcFormat} from './stepFormat'


const bytes = (text) => new TextEncoder().encode(text)

// A short run of bytes that is not part-21 and not valid UTF-8.
const NOT_TEXT = new TextEncoder().encode('\u0000\u0001\uFFFD')

const MAGIC = 'ISO-10303-21;\nHEADER;\n'
const TAIL = '\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n'

/**
 * A complete part-21 file whose HEADER section is `body`.
 *
 * @param {string} body header entities
 * @return {Uint8Array}
 */
const part21 = (body) => bytes(MAGIC + body + TAIL)


/**
 * Every case here is a real divergence between conway's detector and the
 * regex mirror Share briefly carried in its place (#1780) — differential
 * testing against the live `ModelFormatDetector` found eleven, each in the
 * expensive direction (Share yes, conway no) that recreates #1776. They are
 * kept as tests of `isConwayIfcFormat` because they are exactly the inputs a
 * future reimplementation would get wrong, so a regression to a text scan
 * fails here loudly rather than in a burned model handle.
 */
describe('isConwayIfcFormat', () => {
  describe('formats', () => {
    it('accepts a well-formed IFC header', () => {
      expect(isConwayIfcFormat(part21(`FILE_SCHEMA(('IFC4'));`))).toBe(true)
      expect(isConwayIfcFormat(part21(`FILE_SCHEMA(('IFC2X3'));`))).toBe(true)
    })

    it('rejects the STEP schemas conway routes elsewhere', () => {
      // `fromStore` is IFC-only; each of these opens through the buffered
      // path instead, and offering it the store path burns a handle.
      expect(isConwayIfcFormat(part21(`FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));`))).toBe(false)
      expect(isConwayIfcFormat(part21(`FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));`))).toBe(false)
      expect(isConwayIfcFormat(part21(
        `FILE_SCHEMA(('AP242_MANAGED_MODEL_BASED_3D_ENGINEERING'));`))).toBe(false)
    })

    it('rejects a schema conway recognises nothing in', () => {
      expect(isConwayIfcFormat(part21(`FILE_SCHEMA(('STRUCTURAL_FRAME_SCHEMA'));`))).toBe(false)
    })

    it('takes the first entry conway recognises, in declaration order', () => {
      // conway returns on the FIRST entry matching ANY known schema, so a
      // STEP schema listed first wins even when IFC follows it. Asking
      // instead whether ANY entry starts with IFC — which the mirror did —
      // answers yes here, where conway answers AP214.
      expect(isConwayIfcFormat(part21(`FILE_SCHEMA(('AUTOMOTIVE_DESIGN'),('IFC4'));`))).toBe(false)
      expect(isConwayIfcFormat(part21(`FILE_SCHEMA(('IFC4'),('AUTOMOTIVE_DESIGN'));`))).toBe(true)
    })

    it('reads the last FILE_SCHEMA, matching a name-keyed header map', () => {
      expect(isConwayIfcFormat(part21(
        `FILE_SCHEMA(('IFC4'));\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));`))).toBe(false)
    })
  })

  describe('files conway cannot parse at all', () => {
    // The detector only answers after `StepHeaderParser.parseHeader` reaches
    // `ENDSEC;` then `DATA;`. A mirror that just finds FILE_SCHEMA in the
    // window says IFC for every one of these, and each is a burned handle.
    it('rejects a truncated header', () => {
      expect(isConwayIfcFormat(bytes(`${MAGIC}FILE_SCHEMA(('IFC4'));\n`))).toBe(false)
    })

    it('rejects a file with no ISO-10303-21 magic', () => {
      expect(isConwayIfcFormat(bytes(
        `HEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n`))).toBe(false)
    })

    it('rejects a missing statement terminator', () => {
      expect(isConwayIfcFormat(bytes(
        `${MAGIC}FILE_SCHEMA(('IFC4'))\nENDSEC;\nDATA;\n`))).toBe(false)
    })

    it('rejects a stray token after the entity', () => {
      expect(isConwayIfcFormat(bytes(
        `${MAGIC}FILE_SCHEMA(('IFC4')) 'x';\nENDSEC;\nDATA;\n`))).toBe(false)
    })

    it('rejects an unterminated comment', () => {
      expect(isConwayIfcFormat(bytes(
        `${MAGIC}FILE_SCHEMA(('IFC4'));\n/* oops\nENDSEC;\nDATA;\n`))).toBe(false)
    })

    it('rejects lowercase keywords', () => {
      // conway compares raw bytes and looks the entity up under its exact
      // decoded name, so none of this is part-21 to it. Every regex in the
      // mirror was case-insensitive.
      expect(isConwayIfcFormat(bytes(`${MAGIC}file_schema(('IFC4'));${TAIL}`))).toBe(false)
      expect(isConwayIfcFormat(bytes(
        `iso-10303-21;\nheader;\nFILE_SCHEMA(('IFC4'));\nendsec;\ndata;\n`))).toBe(false)
    })

    it('rejects bytes that are not part-21 at all', () => {
      expect(isConwayIfcFormat(new Uint8Array(0))).toBe(false)
      expect(isConwayIfcFormat(NOT_TEXT)).toBe(false)
    })
  })

  describe('strings and comments the header scan has to get right', () => {
    it('accepts a comment between the entity name and its arguments', () => {
      // conway's `whitespace()` consumes a comment as whitespace, so this is
      // a perfectly ordinary IFC file and must keep the windowed parse.
      expect(isConwayIfcFormat(part21(`FILE_SCHEMA /* note */ (('IFC4'));`))).toBe(true)
    })

    it('accepts spaces inside the schema name', () => {
      expect(isConwayIfcFormat(part21(`FILE_SCHEMA((' I FC4 '));`))).toBe(true)
    })

    it('ignores a commented-out IFC schema', () => {
      expect(isConwayIfcFormat(part21(
        `/* FILE_SCHEMA(('IFC4')); */ FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));`))).toBe(false)
    })

    it('rejects an empty first quoted entry', () => {
      // conway's entry regex is `'([^']+)'` — PLUS, not star. It cannot match
      // the empty pair, backtracks, and pairs the empty literal's closing
      // quote with the next entry's opening one, so it never sees IFC4 and
      // detects no format. A mirror that matched `[^']*` and dropped empties
      // read this as IFC.
      expect(isConwayIfcFormat(part21(`FILE_SCHEMA(('','IFC4'));`))).toBe(false)
      expect(isConwayIfcFormat(part21(`FILE_SCHEMA(('AB''','IFC4'));`))).toBe(false)
    })

    it('rejects an IFC decoy hidden behind a \\S\\ escape', () => {
      // conway's string DFA swallows the byte after `\S\` even when it is an
      // apostrophe (`\S\'` encodes a high-half character, routine in
      // German-language headers). So this whole FILE_DESCRIPTION is one
      // string to conway and the real schema is AP214, while a scanner that
      // only knows the doubled-apostrophe escape has its quote parity
      // inverted from that point on and finds the decoy IFC4.
      expect(isConwayIfcFormat(part21(
        `FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\n` +
        `FILE_DESCRIPTION(('\\S\\');FILE_SCHEMA((\\S\\'IFC4\\S\\'));X(\\S\\''),'2;1');`))).toBe(false)
    })

    it('rejects an ENDSEC hidden in a header string', () => {
      // Bounding the scan at a raw `ENDSEC;` truncates the section before the
      // later, overriding AP214 entity — and with last-wins that RESURRECTS
      // the earlier IFC4. Early truncation is not the safe direction it looks.
      expect(isConwayIfcFormat(part21(
        `FILE_SCHEMA(('IFC4'));\n` +
        `FILE_DESCRIPTION(('ENDSEC;'),'2;1');\n` +
        `FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));`))).toBe(false)
    })

    it('ignores a FILE_SCHEMA lookalike in the DATA section', () => {
      expect(isConwayIfcFormat(bytes(
        `${MAGIC}FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\nDATA;\n` +
        `#1=X();\nFILE_SCHEMA(('IFC4'));\nENDSEC;\n`))).toBe(false)
    })

    it('ignores an entity whose name merely ends in FILE_SCHEMA', () => {
      expect(isConwayIfcFormat(part21(
        `FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nNOT_FILE_SCHEMA(('IFC4'));`))).toBe(false)
    })
  })
})
