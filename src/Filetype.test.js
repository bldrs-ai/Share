import {
  FilenameParseError,
  analyzeHeaderStr,
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

  context('analyzeHeaderStr', () => {
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
})
