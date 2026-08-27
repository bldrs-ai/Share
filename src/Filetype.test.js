import {gzipSync} from 'three/examples/jsm/libs/fflate.module.js'
import {
  FilenameParseError,
  analyzeHeader,
  analyzeHeaderStr,
  fileSuffixBoundaryRegex,
  getValidExtension,
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
    it('returns the declared schema for both families', () => {
      expect(stepSchemaName('FILE_SCHEMA((\'IFC4\'));')).toBe('IFC4')
      expect(stepSchemaName('FILE_SCHEMA((\'AUTOMOTIVE_DESIGN\'));')).toBe('AUTOMOTIVE_DESIGN')
      expect(stepSchemaName('FILE_SCHEMA  ( ( \' IFC2X3 \' ) );')).toBe('IFC2X3')
    })

    it('separates "did not say" from "said STEP"', () => {
      // The distinction `classifyStepFamily` cannot express, because it
      // folds both into 'ifc'. A caller whose false-'ifc' is expensive —
      // `Loader.js#canOpenFromStore` gating conway's IFC-only store open —
      // needs a non-null name before it trusts the classification.
      expect(stepSchemaName('HEADER;\nENDSEC;')).toBeNull()
      expect(stepSchemaName('FILE_SCHEMA(());')).toBeNull()
      expect(stepSchemaName('FILE_SCHEMA((\'\'));')).toBeNull()
      // Same inputs, classifier still answers 'ifc' — that default is why
      // the guard above exists.
      expect(analyzeHeaderStr('ISO-10303-21;\nFILE_SCHEMA((\'\'));')).toBe('ifc')
    })
  })
})
