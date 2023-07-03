import {
  isExtensionSupported,
  pathSuffixSupported,
  splitAroundExtension,
} from './Filetype'


describe('Filetype', () => {
  const supportedFiletypes = ['ifc', 'obj']
  const unsupportedFiletypes = ['arff', 'zip']
  it('supports only known extensions', () => {
    for (const ext of supportedFiletypes) {
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
    for (const ext of supportedFiletypes) {
      const {parts, extension} = splitAroundExtension(`asdf.${ext}/blah`)
      expect(parts).toStrictEqual(['asdf', '/blah'])
      expect(extension).toStrictEqual(`.${ext}`)
    }
  })
})
