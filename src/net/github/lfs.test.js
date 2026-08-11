import {
  LFS_POINTER_PREFIX,
  isLfsPointerBase64,
  lfsMediaUrl,
  looksLikeLfsPointer,
} from './lfs'


// A real pointer, byte-for-byte the shape GitHub serves for
// bldrs-ai/test-models/usd/F119_Engine_2.usdz.
const POINTER_TEXT =
  `${LFS_POINTER_PREFIX}\n` +
  'oid sha256:364dde066e1c7a8e4d24060a3dc66e4bf98d9263d1a4b2c9f0e1a2b3c4d5e6f7\n' +
  'size 24911208\n'


/**
 * @param {string} text
 * @return {ArrayBuffer}
 */
function toArrayBuffer(text) {
  return new TextEncoder().encode(text).buffer
}


/**
 * @param {string} text
 * @return {string} base64, newline-wrapped like the Contents API's
 */
function toWrappedBase64(text) {
  const lineLen = 60
  const raw = btoa(text)
  return raw.replace(new RegExp(`(.{${lineLen}})`, 'g'), '$1\n')
}


describe('net/github/lfs', () => {
  describe('looksLikeLfsPointer', () => {
    it('detects a pointer as text and as bytes', () => {
      expect(looksLikeLfsPointer(POINTER_TEXT)).toBe(true)
      expect(looksLikeLfsPointer(toArrayBuffer(POINTER_TEXT))).toBe(true)
      expect(looksLikeLfsPointer(new Uint8Array(toArrayBuffer(POINTER_TEXT)))).toBe(true)
    })

    it('leaves real model content alone', () => {
      // USDA text, a USDZ zip's leading bytes, and an IFC header — none
      // of which may be mistaken for a pointer.
      expect(looksLikeLfsPointer('#usda 1.0\n')).toBe(false)
      expect(looksLikeLfsPointer(new Uint8Array(toArrayBuffer('PK')))).toBe(false)
      expect(looksLikeLfsPointer(toArrayBuffer('ISO-10303-21;\nHEADER;\n'))).toBe(false)
    })

    it('handles empty and non-buffer input without throwing', () => {
      expect(looksLikeLfsPointer('')).toBe(false)
      expect(looksLikeLfsPointer(null)).toBe(false)
      expect(looksLikeLfsPointer(undefined)).toBe(false)
      expect(looksLikeLfsPointer(new ArrayBuffer(0))).toBe(false)
      expect(looksLikeLfsPointer({})).toBe(false)
    })
  })

  describe('isLfsPointerBase64', () => {
    it('detects a pointer through base64, including newline-wrapped', () => {
      expect(isLfsPointerBase64(btoa(POINTER_TEXT))).toBe(true)
      expect(isLfsPointerBase64(toWrappedBase64(POINTER_TEXT))).toBe(true)
    })

    it('does not flag ordinary inline content', () => {
      expect(isLfsPointerBase64(btoa('#usda 1.0\n(\n    upAxis = "Y"\n)\n'))).toBe(false)
      // 'dGVzdCBkYXRh' is the api-handlers-github mock's inline content.
      expect(isLfsPointerBase64('dGVzdCBkYXRh\n')).toBe(false)
      expect(isLfsPointerBase64('')).toBe(false)
      expect(isLfsPointerBase64(null)).toBe(false)
    })

    it('returns false rather than throwing on malformed base64', () => {
      expect(isLfsPointerBase64('!!!not base64!!!')).toBe(false)
    })
  })

  describe('lfsMediaUrl', () => {
    it('rewrites a raw URL to the media host', () => {
      expect(lfsMediaUrl('https://raw.githubusercontent.com/bldrs-ai/test-models/main/usd/F119_Engine_2.usdz'))
        .toBe('https://media.githubusercontent.com/media/bldrs-ai/test-models/main/usd/F119_Engine_2.usdz')
    })

    it('preserves the token a private repo download_url carries', () => {
      expect(lfsMediaUrl('https://raw.githubusercontent.com/org/repo/main/a.ifc?token=SECRET'))
        .toBe('https://media.githubusercontent.com/media/org/repo/main/a.ifc?token=SECRET')
    })

    it('returns null for URLs it should not rewrite', () => {
      expect(lfsMediaUrl('https://example.com/model.ifc')).toBe(null)
      expect(lfsMediaUrl('/index.ifc')).toBe(null)
      expect(lfsMediaUrl('')).toBe(null)
    })
  })
})
