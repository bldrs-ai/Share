import {
  FilenameParseError,
  isExtensionSupported,
  pathSuffixSupported,
  splitAroundExtension,
  supportedTypes,
} from './Filetype'


describe('Filetype', () => {
  const unsupportedFiletypes = ['arff', 'zip']
  it('supports only known extensions', () => {
    for (const ext of supportedTypes) {
      expect(isExtensionSupported(ext)).toBe(true)
      const path = `foo/bar/baz.${ext}`
      expect(pathSuffixSupported(path)).toBe(true)
    }
    for (const ext of unsupportedFiletypes) {
      expect(isExtensionSupported(ext)).toBe(false)
      const path = `foo/bar/baz.${ext}`
      expect(pathSuffixSupported(path)).toBe(false)
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
})
