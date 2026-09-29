import axios from 'axios'
import {gzipSync} from 'three/examples/jsm/libs/fflate.module.js'
import {
  FilenameParseError,
  analyzeHeader,
  analyzeHeaderStr,
  fileSuffixBoundaryRegex,
  getValidExtension,
  guessType,
  guessTypeFromFile,
  guessTypeFromNameOrFile,
  isExtensionSupported,
  pathSuffixSupported,
  splitAroundExtension,
  stepSchemaName,
  supportedTypes,
} from './Filetype'


describe('Filetype', () => {
  const unsupportedFiletypes = ['arff', 'zip']
  it('supports only known extensions', () => {
    for (const ext of supportedTypes) {
      const extLower = ext.toLowerCase()
      const extUpper = ext.toUpperCase()
      expect(isExtensionSupported(ext)).toBe(true)
      expect(isExtensionSupported(extLower)).toBe(true)
      expect(isExtensionSupported(extUpper)).toBe(true)
      const path = `foo/bar/baz.${ext}`
      const pathLower = `foo/bar/baz.${extLower}`
      const pathUpper = `foo/bar/baz.${extUpper}`
      expect(pathSuffixSupported(path)).toBe(true)
      expect(pathSuffixSupported(pathLower)).toBe(true)
      expect(pathSuffixSupported(pathUpper)).toBe(true)
    }
    for (const ext of unsupportedFiletypes) {
      const extLower = ext.toLowerCase()
      const extUpper = ext.toUpperCase()
      expect(isExtensionSupported(ext)).toBe(false)
      expect(isExtensionSupported(extLower)).toBe(false)
      expect(isExtensionSupported(extUpper)).toBe(false)
      const path = `foo/bar/baz.${ext}`
      const pathLower = `foo/bar/baz.${extLower}`
      const pathUpper = `foo/bar/baz.${extUpper}`
      expect(pathSuffixSupported(path)).toBe(false)
      expect(pathSuffixSupported(pathLower)).toBe(false)
      expect(pathSuffixSupported(pathUpper)).toBe(false)
    }
  })

  it('getValidExtension', () => {
    for (const ext of supportedTypes) {
      const extLower = ext.toLowerCase()
      const extUpper = ext.toUpperCase()
      expect(getValidExtension(ext)).toBe(extLower)
      expect(getValidExtension(extLower)).toBe(extLower)
      expect(getValidExtension(extUpper)).toBe(extLower)
    }
  })

  it('fileSuffixBoundaryRegex splits pathname into (model file, element path)', () => {
    // The motivating case: a filetype name ("step") as a plain directory
    // segment must NOT split — only the file's own dotted suffix at a
    // path boundary does. Pre-fix, permalinks under such directories
    // produced a 3-way split and element-path selection never ran.
    const pathname = '/share/v/gh/bldrs-ai/test-models/main/step/nist/as1-oc-214.stp/5/6217/3804'
    expect(pathname.split(fileSuffixBoundaryRegex)).toStrictEqual(
      ['/share/v/gh/bldrs-ai/test-models/main/step/nist/as1-oc-214', '/5/6217/3804'])
    // No element path → empty trailing part; suffix at end-of-string matches.
    expect('/share/v/p/index.ifc'.split(fileSuffixBoundaryRegex)).toStrictEqual(['/share/v/p/index', ''])
    // Mid-filename ".ifc" (no boundary) must not split.
    expect('/share/v/p/index.ifcx/1'.split(fileSuffixBoundaryRegex)).toStrictEqual(['/share/v/p/index.ifcx/1'])
    for (const ext of supportedTypes) {
      expect(`/x/${ext}/y/model.${ext}/1/2`.split(fileSuffixBoundaryRegex)).toStrictEqual(
        [`/x/${ext}/y/model`, '/1/2'])
    }
  })

  it('splitAroundExtension', () => {
    for (const ext of supportedTypes) {
      const {parts, extension} = splitAroundExtension(`asdf.${ext}/blah`)
      expect(parts).toStrictEqual(['asdf', '/blah'])
      expect(extension).toStrictEqual(`.${ext}`)
    }
    expect(() => {
      splitAroundExtension(`asdf.com/blah`)
    }).toThrow(FilenameParseError)
  })

  describe('analyzeHeaderStr', () => {
    it('matches bld header', () => {
      const header = `{\n` +
            `  "metadata": {`
      expect(analyzeHeaderStr(header)).toBe('bld')
    })

    it('matches gltf header', () => {
      const header = `glTFasdfasdfasdf`
      expect(analyzeHeaderStr(header)).toBe('gltf')
    })

    it('matches obj header', () => {
      const header = `# blah blah.\n` +
            `\n\n` +
            `v 0.061043 0.025284 0.034490\n` +
            `v 0.011829 0.022302 0.083267\n` +
            `v 0`
      expect(analyzeHeaderStr(header)).toBe('obj')
    })

    it('matches pdb header', () => {
      expect(analyzeHeaderStr(`COMPND  bucky.pdb`)).toBe('pdb')
      expect(analyzeHeaderStr(`HEADER    CSD ENTRY GLOBAL`)).toBe('pdb')
      expect(analyzeHeaderStr(`ORIGX1      1.000000  0.000000  0.000000        0.00000`)).toBe('pdb')
    })

    it('matches ifc header', () => {
      const header = `ISO-10303-21;\n` +
            `HEADER;\n` +
            `FILE_DESCRIPTION((''),'2;1');\n` +
            `FILE_NAME('model.ifc','',(''),(''),'','','');\n` +
            `FILE_SCHEMA(('IFC4'));\n` +
            `ENDSEC;\n`
      expect(analyzeHeaderStr(header)).toBe('ifc')
    })

    it('matches step header as step, not ifc', () => {
      const header = `ISO-10303-21;\n` +
            `HEADER;\n` +
            `FILE_DESCRIPTION((''),'2;1');\n` +
            `FILE_NAME('part.step','',(''),(''),'','','');\n` +
            `FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));\n` +
            `ENDSEC;\n`
      expect(analyzeHeaderStr(header)).toBe('step')
    })

    it('does not misclassify step as ifc when the name contains "IFC"', () => {
      // "IFC" appears in the FILE_NAME but the schema is a STEP AP, so the
      // FILE_SCHEMA-anchored check must still resolve to step.
      const header = `ISO-10303-21;\n` +
            `HEADER;\n` +
            `FILE_NAME('myIFCexport.stp','',(''),(''),'','','');\n` +
            `FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));\n` +
            `ENDSEC;\n`
      expect(analyzeHeaderStr(header)).toBe('step')
    })

    it('defaults part-21 to ifc when FILE_SCHEMA is absent from the window', () => {
      // FILE_SCHEMA truncated out of the sniffed header — fall back to the
      // dominant format rather than mislabeling as step.
      const header = `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\n`
      expect(analyzeHeaderStr(header)).toBe('ifc')
    })

    it('matches stl header', () => {
      expect(analyzeHeaderStr(`solid smth`)).toBe('stl')
    })

    it('matches ply header', () => {
      const header = `ply\n` +
            `format binary_little_endian 1.0\n` +
            `element vertex 100\n` +
            `property float x\n`
      expect(analyzeHeaderStr(header)).toBe('ply')
    })

    it('matches xyz header', () => {
      const header = `# header1 \n` +
            `#  \n` +
            `  0.3517846     -0.7869986      -2.873479`
      expect(analyzeHeaderStr(header)).toBe('xyz')
    })

    it('matches usda header', () => {
      const header = `#usda 1.0\n(\n    upAxis = "Y"\n)`
      expect(analyzeHeaderStr(header)).toBe('usda')
    })
  })

  describe('analyzeHeader (binary)', () => {
    // Test constants
    const GLB_MAGIC_NUMBER = 0x46546C67 // "glTF" in little-endian
    const WRONG_MAGIC_NUMBER = 0x12345678
    const GLB_HEADER_SIZE = 12
    const GLB_MIN_SIZE = 4
    const GLB_VERSION = 2
    const GLB_LENGTH = 1024
    const SMALL_BUFFER_SIZE = 2
    it('detects GLB binary format', () => {
      // Create a mock GLB header with the correct magic number
      const buffer = new ArrayBuffer(GLB_HEADER_SIZE)
      const view = new DataView(buffer)
      view.setUint32(0, GLB_MAGIC_NUMBER, true) // GLB magic number in little-endian
      view.setUint32(GLB_MIN_SIZE, GLB_VERSION, true) // Version 2
      view.setUint32(8, GLB_LENGTH, true) // Length

      expect(analyzeHeader(buffer)).toBe('glb')
    })

    it('detects GLB with minimal header size', () => {
      // Test with exactly 4 bytes (minimum for magic number detection)
      const buffer = new ArrayBuffer(GLB_MIN_SIZE)
      const view = new DataView(buffer)
      view.setUint32(0, GLB_MAGIC_NUMBER, true) // GLB magic number

      expect(analyzeHeader(buffer)).toBe('glb')
    })

    it('does not detect GLB with wrong magic number', () => {
      const buffer = new ArrayBuffer(GLB_HEADER_SIZE)
      const view = new DataView(buffer)
      view.setUint32(0, WRONG_MAGIC_NUMBER, true) // Wrong magic number
      view.setUint32(GLB_MIN_SIZE, GLB_VERSION, true)
      view.setUint32(8, GLB_LENGTH, true)

      // Should fall back to text analysis, which will return null for this data
      expect(analyzeHeader(buffer)).toBe(null)
    })

    it('handles buffer smaller than 4 bytes', () => {
      const buffer = new ArrayBuffer(SMALL_BUFFER_SIZE)
      // Should fall back to text analysis
      expect(analyzeHeader(buffer)).toBe(null)
    })

    it('falls back to text analysis for non-GLB binary data', () => {
      // Create buffer with OBJ content
      const objContent = 'v 0.0 0.0 0.0\nv 1.0 0.0 0.0\nv 0.0 1.0 0.0'
      const encoder = new TextEncoder()
      const buffer = encoder.encode(objContent).buffer

      expect(analyzeHeader(buffer)).toBe('obj')
    })

    it('falls back to text analysis for non-GLB content', () => {
      // Create buffer with JSON content that doesn't start with "glTF"
      const jsonContent = '{"asset":{"version":"2.0"},"scenes":[{"nodes":[0]}]}'
      const encoder = new TextEncoder()
      const buffer = encoder.encode(jsonContent).buffer

      // This should fall back to text analysis and return null since it doesn't match any pattern
      expect(analyzeHeader(buffer)).toBe(null)
    })

    it('detects SPZ by its decompressed magic, not by gzip alone', () => {
      // A real .spz is a gzip stream whose DECOMPRESSED bytes begin with
      // SPZ's magic 'NGSP'. Gzip alone must not classify: every
      // .tar.gz / gzipped log shares that signature, and routing those
      // to the splat decoder turns a clean "unknown type" alert into a
      // parse failure deep inside wasm (adding-model-formats.md).
      const spzHead = new Uint8Array([...Array.from('NGSP', (c) => c.charCodeAt(0)), 2, 0, 0, 0])
      expect(analyzeHeader(gzipSync(spzHead).buffer)).toBe('spz')
    })

    it('leaves a non-SPZ gzip stream unrecognized', () => {
      const tarball = new TextEncoder().encode('not a splat, just gzipped text content')
      expect(analyzeHeader(gzipSync(tarball).buffer)).toBe(null)
    })

    it('reads a gzipped model as the model inside the envelope', () => {
      // Share's own `.glb.gz` export (#1854), opened back (#1831 S5). gzip is
      // a transport encoding, so the answer is the format underneath — which
      // is what lets an upload be stored, routed and loaded as the `.glb` it
      // becomes, with no `.gz` anywhere downstream.
      const glb = new TextEncoder().encode('glTFthen the chunks')
      expect(analyzeHeader(gzipSync(glb).buffer)).toBe('glb')
    })

    it('reads a gzipped model by its header, not its name', () => {
      // There is no name here at all — which is the point. A `.glb.gz` that
      // arrived mangled, and a `.glb` that is secretly gzipped, both answer
      // 'glb' because the bytes do.
      const ifc = new TextEncoder().encode(`ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));`)
      expect(analyzeHeader(gzipSync(ifc).buffer)).toBe('ifc')
    })

    it('does not unwrap a gzip inside a gzip', () => {
      // One envelope is the whole feature. Recursing would let a `.gz.gz`
      // (or a chain of them) through as a model, and every unwrap is an
      // inflate of an attacker's choosing.
      const glb = new TextEncoder().encode('glTFthen the chunks')
      expect(analyzeHeader(gzipSync(gzipSync(glb)).buffer)).toBe(null)
    })

    it('leaves a gzip header with no decodable payload unrecognized', () => {
      const GZIP_MAGIC_NUMBER = 0x8B1F // gzip magic 1f 8b, little-endian
      const buffer = new ArrayBuffer(GLB_MIN_SIZE)
      new DataView(buffer).setUint16(0, GZIP_MAGIC_NUMBER, true)
      expect(analyzeHeader(buffer)).toBe(null)
    })

    it('detects USDC crate binary format', () => {
      const buffer = new TextEncoder().encode('PXR-USDC and then the rest of the crate file').buffer
      expect(analyzeHeader(buffer)).toBe('usdc')
    })

    it('detects binary Align ADF ahead of the loose text checks', () => {
      // The body is binary, so bytes spelling "FBX" can land in the sniff
      // window; the magic check must win before analyzeHeaderStr's
      // `includes('FBX')` sees them.
      const buffer = new TextEncoder().encode('AlignDataFile ( bin )\nVersion 1.1\n\n{JawPair FBX').buffer
      expect(analyzeHeader(buffer)).toBe('adf')
      expect(getValidExtension('scan.ADF')).toBe('adf')
    })

    /**
     * Build the start of a zip: a local file header whose first entry
     * has the given name. Enough for the sniffing path, which only
     * reads the signature, the name length, and the name.
     *
     * @param {string} firstEntryName
     * @return {ArrayBuffer}
     */
    function makeZipHeader(firstEntryName) {
      const zipNameOffset = 30
      const zipNameLenOffset = 26
      const nameBytes = new TextEncoder().encode(firstEntryName)
      const buffer = new ArrayBuffer(zipNameOffset + nameBytes.length)
      const bytes = new Uint8Array(buffer)
      bytes.set([...Array.from('PK', (c) => c.charCodeAt(0)), 3, 4])
      new DataView(buffer).setUint16(zipNameLenOffset, nameBytes.length, true)
      bytes.set(nameBytes, zipNameOffset)
      return buffer
    }

    it('detects a zip whose first entry is a USD layer as USDZ', () => {
      expect(analyzeHeader(makeZipHeader('model.usdc'))).toBe('usdz')
      expect(analyzeHeader(makeZipHeader('cube.usda'))).toBe('usdz')
      expect(analyzeHeader(makeZipHeader('scene.USD'))).toBe('usdz')
    })

    it('detects a zip whose first entry is a SOG manifest as SOG', () => {
      expect(analyzeHeader(makeZipHeader('meta.json'))).toBe('sog')
      expect(analyzeHeader(makeZipHeader('bundle/meta.json'))).toBe('sog')
    })

    it('rejects non-USD non-SOG zip containers (docx, plain zip) as unknown', () => {
      // Pre-USD behavior for these was a clean null -> "unknown type"
      // alert on upload; classifying them usdz would fail deep in
      // USDLoader instead.
      expect(analyzeHeader(makeZipHeader('[Content_Types].xml'))).toBe(null)
      expect(analyzeHeader(makeZipHeader('readme.txt'))).toBe(null)
      // Not the manifest — only a first-entry meta.json marks a SOG.
      expect(analyzeHeader(makeZipHeader('notmeta.json'))).toBe(null)
    })

    it('does not swallow text that merely starts with PK', () => {
      const buffer = new TextEncoder().encode('PKX is not a zip at all, just text').buffer
      expect(analyzeHeader(buffer)).toBe(null)
    })

    it('detects GLTF text format with proper header', () => {
      // Note: Text starting with "glTF" will be detected as GLB because "glTF" encodes
      // to the same bytes as the GLB magic number. This is correct behavior since
      // both formats use "glTF" as their signature, but GLB check comes first.
      const gltfHeader = 'glTF{"asset":{"version":"2.0"}}'
      const encoder = new TextEncoder()
      const buffer = encoder.encode(gltfHeader).buffer

      // This will be detected as GLB because the binary check happens first
      expect(analyzeHeader(buffer)).toBe('glb')
    })
  })

  describe('new supported types', () => {
    it('includes GLB and GLTF in supported types', () => {
      expect(supportedTypes).toContain('glb')
      expect(supportedTypes).toContain('gltf')
    })

    it('includes PDB in supported types', () => {
      expect(supportedTypes).toContain('pdb')
    })

    it('supports GLB file extensions', () => {
      expect(isExtensionSupported('glb')).toBe(true)
      expect(isExtensionSupported('GLB')).toBe(true)
      expect(pathSuffixSupported('model.glb')).toBe(true)
      expect(pathSuffixSupported('path/to/model.GLB')).toBe(true)
    })

    it('supports GLTF file extensions', () => {
      expect(isExtensionSupported('gltf')).toBe(true)
      expect(isExtensionSupported('GLTF')).toBe(true)
      expect(pathSuffixSupported('model.gltf')).toBe(true)
      expect(pathSuffixSupported('path/to/model.GLTF')).toBe(true)
    })

    it('validates GLB and GLTF extensions correctly', () => {
      expect(getValidExtension('test.glb')).toBe('glb')
      expect(getValidExtension('test.GLTF')).toBe('gltf')
      expect(getValidExtension('GLB')).toBe('glb')
      expect(getValidExtension('gltf')).toBe('gltf')
    })

    it('reads a gzip-enveloped name as the format underneath', () => {
      // `model.glb.gz` is a glb: the envelope comes off before any loader
      // sees the bytes (`loader/gzipEnvelope.js`), so the name that describes
      // the model is the one with the `.gz` removed. In caps too — the same
      // lowercasing every other extension gets.
      expect(getValidExtension('model.glb.gz')).toBe('glb')
      expect(getValidExtension('MODEL.GLB.GZ')).toBe('glb')
      expect(getValidExtension('path/to/index.ifc.gz')).toBe('ifc')
    })

    it('refuses a name that is only an envelope', () => {
      // A file called `.gz`, or `archive.gz`: there is no format in the name
      // to find, and answering one would be a guess. The header is what
      // settles these (`guessTypeFromNameOrFile`).
      expect(() => getValidExtension('.gz')).toThrow(FilenameParseError)
      expect(() => getValidExtension('archive.gz')).toThrow(FilenameParseError)
      expect(() => getValidExtension('gz')).toThrow(FilenameParseError)
    })

    it('validates the USD family, matching the longest extension', () => {
      // 'usd' is a prefix of the other three — the alternation must not
      // stop at the prefix (typeRegexStr sorts longest-first).
      expect(getValidExtension('model.usd')).toBe('usd')
      expect(getValidExtension('model.usda')).toBe('usda')
      expect(getValidExtension('model.usdc')).toBe('usdc')
      expect(getValidExtension('model.USDZ')).toBe('usdz')
    })
  })

  describe('stepSchemaName', () => {
    // Real input, because the scan is bounded to the HEADER section: a bare
    // fragment has no section to find and correctly reads as "did not say".
    const hdr = (body) => `ISO-10303-21;\nHEADER;\n${body}\nENDSEC;\nDATA;\nENDSEC;\n`

    it('returns the declared schema for both families', () => {
      expect(stepSchemaName(hdr(`FILE_SCHEMA(('IFC4'));`))).toBe('IFC4')
      expect(stepSchemaName(hdr(`FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));`))).toBe('AUTOMOTIVE_DESIGN')
      expect(stepSchemaName(hdr(`FILE_SCHEMA  ( ( ' IFC2X3 ' ) );`))).toBe('IFC2X3')
    })

    it(`skips Part-21 comments the way conway's header parser does`, () => {
      // ISO-10303-21 allows a comment anywhere whitespace is allowed, and
      // conway's `StepHeaderParser` consumes one as whitespace — so
      // `ModelFormatDetector` calls these IFC. Reading them as "no schema"
      // would cost a large IFC its windowed parse.
      expect(stepSchemaName(hdr(`FILE_SCHEMA /* exported by X */ (('IFC4'));`))).toBe('IFC4')
      expect(stepSchemaName(hdr(`FILE_SCHEMA((/* why */'IFC4'));`))).toBe('IFC4')
      expect(stepSchemaName(hdr(`FILE_SCHEMA/* a */(/* b */(/* c */'IFC4'));`))).toBe('IFC4')
    })

    it('ignores a FILE_SCHEMA entity that is itself inside a comment', () => {
      // The dangerous direction, and the one a comment-tolerant gap pattern
      // cannot fix: the whole entity sits INSIDE the comment, so no amount of
      // tolerance BETWEEN tokens excludes it. conway's parser skips the
      // comment and reads AP214; a raw-text scan would answer IFC, send a
      // STEP file down conway's IFC-only store open, and burn a model handle.
      const body = `/* FILE_SCHEMA(('IFC4')); */\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));`
      expect(stepSchemaName(hdr(body))).toBe('AUTOMOTIVE_DESIGN')
      expect(analyzeHeaderStr(hdr(body))).toBe('step')
    })

    it('takes the LAST FILE_SCHEMA, matching conway\'s last-wins Map', () => {
      // conway stores header entities in a Map keyed by name
      // (`step_parser.js:193`), so a duplicated FILE_SCHEMA overwrites.
      // Reading the first would answer IFC here where conway answers AP214 —
      // the dangerous direction again.
      const body = `FILE_SCHEMA(('IFC4'));\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));`
      expect(stepSchemaName(hdr(body))).toBe('AUTOMOTIVE_DESIGN')
      expect(analyzeHeaderStr(hdr(body))).toBe('step')
    })

    it('ignores a FILE_SCHEMA lookalike past ENDSEC', () => {
      // The caller sniffs a fixed 64 KiB prefix, which on any real model runs
      // well into DATA, where a quoted string may contain anything. conway
      // reads FILE_SCHEMA from the HEADER section only.
      const text = `ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\n` +
        `DATA;\n#1=IFCPROPERTYSINGLEVALUE('FILE_SCHEMA((''IFC4''));');\nENDSEC;\n`
      expect(stepSchemaName(text)).toBe('AUTOMOTIVE_DESIGN')
    })

    it('keeps a comment-like sequence inside a string literal', () => {
      // Inside a Part-21 string `/*` is ordinary text. Masking it would join
      // the surrounding text and could resurrect the bug it exists to fix.
      expect(stepSchemaName(hdr(
        `FILE_NAME('/* not a comment','*/');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));`,
      ))).toBe('AUTOMOTIVE_DESIGN')
      // A doubled apostrophe escapes one inside the string; the string stays
      // open across it, so the `/*` after it is still literal.
      expect(stepSchemaName(hdr(
        `FILE_NAME('it''s /* fine');\nFILE_SCHEMA(('IFC4'));`,
      ))).toBe('IFC4')
    })

    it('does not match FILE_SCHEMA inside a longer entity name', () => {
      // conway parses header records under their exact names and inspects
      // only the `FILE_SCHEMA` key, so `NOT_FILE_SCHEMA` is invisible to it.
      // An unanchored scan reads it as the schema — and with last-wins that
      // is the dangerous direction whenever the lookalike follows the real
      // entity: we answer IFC where conway answers AP214.
      const body = `FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nNOT_FILE_SCHEMA(('IFC4'));`
      expect(stepSchemaName(hdr(body))).toBe('AUTOMOTIVE_DESIGN')
      expect(analyzeHeaderStr(hdr(body))).toBe('step')
    })

    it('separates "did not say" from "said STEP"', () => {
      // The distinction `classifyStepFamily` cannot express, because it
      // folds both into 'ifc'. Kept for callers that want to report what a
      // file declared rather than pick a name for it; the format decision
      // that used to depend on it now goes through conway's detector
      // (`src/loader/stepFormat.js`).
      expect(stepSchemaName('HEADER;\nENDSEC;')).toBeNull()
      expect(stepSchemaName(hdr(`FILE_SCHEMA(());`))).toBeNull()
      expect(stepSchemaName(hdr(`FILE_SCHEMA((''));`))).toBeNull()
      // No HEADER section at all — nothing conway would parse a schema from.
      expect(stepSchemaName(`FILE_SCHEMA(('IFC4'));`)).toBeNull()
      // Same inputs, classifier still answers 'ifc' — that default is why
      // the guard above exists.
      expect(analyzeHeaderStr(hdr(`FILE_SCHEMA((''));`))).toBe('ifc')
    })
  })
})


// Not the head of any format the sniffer knows, and not valid UTF-8 either.
const UNRECOGNIZABLE_BYTE = 0xff
const UNRECOGNIZABLE_BYTES = new Uint8Array([UNRECOGNIZABLE_BYTE, 0])


describe('guessTypeFromNameOrFile', () => {
  // A picked `File`'s surface, on the global Blob: under `jest-fixed-jsdom`
  // jsdom's own `File` has no `arrayBuffer()` and neither do its slices, so
  // the code under test could not read one. A browser's File has both.
  /**
   * @param {Uint8Array} bytes
   * @param {string} name
   * @return {Blob} with a `name`, as a File has
   */
  function fileOf(bytes, name) {
    return Object.assign(new Blob([bytes]), {name})
  }

  it('answers from the name when the name parses, even against the header', async () => {
    // The name comes first because the user chose it and the sniffer is
    // deliberately conservative — binary STL has no magic to match at all, so
    // a header-only answer would be worse than the name for it. Asserted on
    // a file whose two answers DISAGREE, or 'stl' would be what both said.
    const glbBytes = new TextEncoder().encode('glTFand the chunks after it')
    expect(await guessTypeFromNameOrFile(fileOf(glbBytes, 'part.stl'))).toBe('stl')
  })

  it('answers from the header when the name does not parse', async () => {
    // The case that used to throw "Cannot extract filetype from filename":
    // a name with no format in it at all. The bytes still say what it is.
    const glbBytes = new TextEncoder().encode('glTFand the chunks after it')
    expect(await guessTypeFromNameOrFile(fileOf(glbBytes, 'download'))).toBe('glb')
    expect(await guessTypeFromNameOrFile(fileOf(gzipSync(glbBytes), '.gz'))).toBe('glb')
  })

  it('answers null when neither the name nor the header knows', async () => {
    expect(await guessTypeFromNameOrFile(fileOf(UNRECOGNIZABLE_BYTES, 'mystery'))).toBe(null)
  })
})


describe('binary STL, recognized by its structure', () => {
  // Binary STL has no magic: an 80-byte header anyone may fill with anything,
  // a little-endian uint32 triangle count, then 50 bytes per triangle. The one
  // reliable signature is that arithmetic adding up to the file's length, so
  // the sniff needs the whole file's size, not just its head
  // (bldrs-ai/test-models#69).
  const STL_HEADER_BYTES = 80
  const STL_COUNT_BYTES = 4
  const STL_TRIANGLE_BYTES = 50
  // The sniff window `guessTypeFromFile` reads.
  const SNIFF_WINDOW_BYTES = 1024

  // The first triangle of the test-models#69 Dodge Challenger export, as
  // stored: normal, three vertices (float32 LE), attribute word. Real bytes
  // rather than zeros, so the payload the text checks see is what an STL
  // actually carries.
  const REAL_TRIANGLE_HEX =
    '3bc259bf24624a3d7901063f2fdddcc13d0a51426abcda41f628dec193983e42ac1cdc41' +
    '5839dcc13d0a5142a8c6db410000'
  const HEX_RADIX = 16
  /**
   * @param {string} hex
   * @return {Uint8Array}
   */
  const hexBytes = (hex) => Uint8Array.from(hex.match(/../g), (h) => parseInt(h, HEX_RADIX))
  const REAL_TRIANGLE = hexBytes(REAL_TRIANGLE_HEX)

  /**
   * @param {Uint8Array} header up to 80 bytes; the rest of the header is zero
   * @param {number} triangleCount written at offset 80, and laid out after it
   * @param {number} [extraBytes] trailing bytes past what the count accounts for
   * @return {Uint8Array} a whole binary STL file
   */
  function binaryStl(header, triangleCount, extraBytes = 0) {
    const bytes = new Uint8Array(
      STL_HEADER_BYTES + STL_COUNT_BYTES + (triangleCount * STL_TRIANGLE_BYTES) + extraBytes)
    bytes.set(header.subarray(0, STL_HEADER_BYTES))
    new DataView(bytes.buffer).setUint32(STL_HEADER_BYTES, triangleCount, true)
    for (let i = 0; i < triangleCount; i++) {
      bytes.set(REAL_TRIANGLE, STL_HEADER_BYTES + STL_COUNT_BYTES + (i * STL_TRIANGLE_BYTES))
    }
    return bytes
  }

  /**
   * What `guessTypeFromFile` hands `analyzeHeader`: the head of the file.
   *
   * @param {Uint8Array} file
   * @return {ArrayBuffer}
   */
  function headOf(file) {
    return file.slice(0, SNIFF_WINDOW_BYTES).buffer
  }

  // Header of the test-models#69 Dodge Challenger export: 80 zero bytes.
  const ZERO_HEADER = new Uint8Array(STL_HEADER_BYTES)
  // Header of the test-models#69 Saturn V parts: Materialise's colored
  // binary STL, "COLOR=" followed by an RGBA quad, space-padded.
  const MATERIALISE_HEADER = (() => {
    const header = new Uint8Array(STL_HEADER_BYTES).fill(' '.charCodeAt(0))
    const prefix = new TextEncoder().encode('STLB ATF 8.12.0.6 COLOR=')
    header.set(prefix)
    header.set(hexBytes('191919ff'), prefix.length)
    return header
  })()
  // More triangles than fit in the sniff window, so the count can only be
  // checked against the file's size, never against the head's.
  const TRIANGLES = 40

  it('detects a binary STL whose header is all zero bytes', () => {
    const file = binaryStl(ZERO_HEADER, TRIANGLES)
    expect(analyzeHeader(headOf(file), {fileByteLength: file.byteLength})).toBe('stl')
  })

  it('detects a Materialise colored binary STL', () => {
    const file = binaryStl(MATERIALISE_HEADER, TRIANGLES)
    expect(analyzeHeader(headOf(file), {fileByteLength: file.byteLength})).toBe('stl')
  })

  it('lets the structure win over the header text of a binary STL', () => {
    // Exporters often start the binary header with "solid" and the part name,
    // which is also how ASCII STL starts — and the text checks that run
    // before `solid` would claim this one for FBX.
    const header = new TextEncoder().encode('solid wheel, converted from FBX')
    const file = binaryStl(header, TRIANGLES)
    expect(analyzeHeader(headOf(file), {fileByteLength: file.byteLength})).toBe('stl')
  })

  it('does not call it binary STL when the count does not add up to the size', () => {
    // One byte over: the header is still the all-zero one that sniffs as
    // STL at the right length, so only the arithmetic is being tested.
    const file = binaryStl(ZERO_HEADER, TRIANGLES, 1)
    expect(analyzeHeader(headOf(file), {fileByteLength: file.byteLength})).toBe(null)
  })

  it('does not call a header-only file binary STL', () => {
    // 84 bytes and a zero count does add up, but an STL with no triangles is
    // nothing to render, and any 84-byte file ending in four zeros would
    // match — stay unrecognized.
    const file = binaryStl(ZERO_HEADER, 0)
    expect(analyzeHeader(headOf(file), {fileByteLength: file.byteLength})).toBe(null)
  })

  it('still detects ASCII STL when the size is known', () => {
    const file = new TextEncoder().encode(
      'solid cube\n  facet normal 0 0 1\n    outer loop\n      vertex 0 0 0\n')
    expect(analyzeHeader(headOf(file), {fileByteLength: file.byteLength})).toBe('stl')
  })

  it('detects a dropped binary STL, which is sniffed without its name', async () => {
    // The drag-and-drop seam (`utils/dragAndDrop.js`) goes by the bytes
    // alone, so this is the path test-models#69's files failed on.
    const file = Object.assign(new Blob([binaryStl(ZERO_HEADER, TRIANGLES)]), {name: 'part.stl'})
    expect(await guessTypeFromFile(file)).toBe('stl')
  })

  it('detects a binary STL behind an extension-less URL, sized by Content-Range', async () => {
    const file = binaryStl(MATERIALISE_HEADER, TRIANGLES)
    const get = jest.spyOn(axios, 'get').mockResolvedValue({
      status: 206,
      data: file.slice(0, SNIFF_WINDOW_BYTES + 1).buffer,
      headers: {'content-range': `bytes 0-${SNIFF_WINDOW_BYTES}/${file.byteLength}`},
    })
    try {
      expect(await guessType('https://example.com/download')).toBe('stl')
    } finally {
      get.mockRestore()
    }
  })

  it('detects a binary STL behind a URL whose server ignores Range', async () => {
    // A 200 is the whole file, so its own length is the file's.
    const file = binaryStl(ZERO_HEADER, TRIANGLES)
    const get = jest.spyOn(axios, 'get').mockResolvedValue({status: 200, data: file.buffer, headers: {}})
    try {
      expect(await guessType('https://example.com/download')).toBe('stl')
    } finally {
      get.mockRestore()
    }
  })
})
