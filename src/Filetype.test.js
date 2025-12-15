import {
  FilenameParseError,
  analyzeHeader,
  analyzeHeaderStr,
  getValidExtension,
  isExtensionSupported,
  pathSuffixSupported,
  splitAroundExtension,
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

    it('matches stl header', () => {
      expect(analyzeHeaderStr(`solid smth`)).toBe('stl')
    })

    it('matches xyz header', () => {
      const header = `# header1 \n` +
            `#  \n` +
            `  0.3517846     -0.7869986      -2.873479`
      expect(analyzeHeaderStr(header)).toBe('xyz')
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
  })
})
