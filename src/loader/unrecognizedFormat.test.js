import {captureMessage} from '@sentry/react'
import {reportUnrecognizedFormat, unrecognizedFormatAlert, uploadExtension} from './unrecognizedFormat'


jest.mock('@sentry/react', () => ({captureMessage: jest.fn()}))


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

  // One issue for the whole family, whatever the file was called; the
  // extension tag's distribution is the ranking of formats users bring.
  it('reports one info message per rejection, fingerprinted as one family', () => {
    reportUnrecognizedFormat(unrecognizedFormatAlert('x', 'a.rvt', 'picker'))
    reportUnrecognizedFormat(unrecognizedFormatAlert('y', 'b.dwg', 'drop'))
    expect(captureMessage).toHaveBeenCalledTimes(2)
    expect(captureMessage).toHaveBeenNthCalledWith(1, 'Unrecognized model format', {
      level: 'info',
      fingerprint: ['unrecognized-format'],
      tags: {'upload.ext': 'rvt', 'upload.entry': 'picker'},
    })
    expect(captureMessage.mock.calls[1][1].fingerprint).toEqual(['unrecognized-format'])
    expect(captureMessage.mock.calls[1][1].tags).toEqual({'upload.ext': 'dwg', 'upload.entry': 'drop'})
  })

  it('never throws, so a reporting failure can\'t hide the dialog', () => {
    captureMessage.mockImplementationOnce(() => {
      throw new Error('sentry down')
    })
    expect(() => reportUnrecognizedFormat({ext: 'rvt', entry: 'drop'})).not.toThrow()
  })
})
