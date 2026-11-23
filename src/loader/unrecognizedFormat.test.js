import {unrecognizedFormatAlert, unrecognizedFormatGaParams, uploadExtension} from './unrecognizedFormat'


describe('loader/unrecognizedFormat', () => {
  beforeEach(() => jest.clearAllMocks())

  describe('uploadExtension', () => {
    it('keeps the last extension, lowercased', () => {
      expect(uploadExtension('Tower_rev03.IFC.RVT')).toBe('rvt')
      expect(uploadExtension('model.ifc.log.html')).toBe('html')
      expect(uploadExtension('plans 2.zip')).toBe('zip')
    })

    // The gzip envelope keeps the user's name, so a rejected `.rvt.gz` is
    // still a rejected .rvt; only a bare `.gz` is tagged as one.
    it('looks through a trailing .gz to the extension it wraps', () => {
      expect(uploadExtension('Tower.rvt.gz')).toBe('rvt')
      expect(uploadExtension('Tower.RVT.GZ')).toBe('rvt')
      expect(uploadExtension('archive.gz')).toBe('gz')
      expect(uploadExtension('.gz')).toBe('gz')
    })

    it('says `none` for a name with no extension', () => {
      expect(uploadExtension('mystery')).toBe('none')
      expect(uploadExtension('trailing.')).toBe('none')
      expect(uploadExtension('')).toBe('none')
      expect(uploadExtension(undefined)).toBe('none')
    })

    // The tag's value set has to stay a short list of formats, so free text
    // after the last dot — spaces, punctuation, non-ASCII, a long run — is
    // folded to one value rather than kept.
    it('says `other` for an extension that isn\'t a short ASCII token', () => {
      expect(uploadExtension('v1.0 final copy')).toBe('other')
      expect(uploadExtension('pieza.stp）')).toBe('other')
      expect(uploadExtension('a.abcdefghijklm')).toBe('other')
    })
  })

  it('builds an alert that carries the extension and never the name', () => {
    const alert = unrecognizedFormatAlert('Cannot extract filetype from filename: Tower.rvt', 'Tower.rvt', 'picker')
    expect(alert).toEqual({
      type: 'unrecognizedFormat',
      message: 'Cannot extract filetype from filename: Tower.rvt',
      ext: 'rvt',
      entry: 'picker',
    })
  })

  // The GA alert's params are the ranking SHARE-1X5's `upload.ext` tag used
  // to be: the extension and the entry, never the file name.
  it('gives GA the extension and entry as params, never the name', () => {
    const params = unrecognizedFormatGaParams(unrecognizedFormatAlert('Cannot open Tower.rvt', 'Tower.rvt', 'picker'))
    expect(params).toEqual({upload_ext: 'rvt', upload_entry: 'picker'})
    expect(JSON.stringify(params)).not.toContain('Tower')
  })
})
