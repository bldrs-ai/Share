import * as Analytics from './analytics'


describe('Analytics', () => {
  test('isAllowed true by default', () => {
    expect(Analytics.isAllowed()).toBe(true)
  })


  test('setIsAllowed', () => {
    expect(Analytics.isAllowed()).toBe(true)
    Analytics.setIsAllowed(false)
    expect(Analytics.isAllowed()).toBe(false)
    Analytics.setIsAllowed(true)
    expect(Analytics.isAllowed()).toBe(true)
  })


  // Route-result shapes mirror routes.ts#handleRoute output. The one
  // excluded shape is the homepage's bundled demo — everything else is
  // a real open.
  describe('isRealModelOpen', () => {
    test('false for the bundled homepage demo (/share/v/p/index.ifc)', () => {
      expect(Analytics.isRealModelOpen({
        kind: 'file',
        isUploadedFile: false,
        filepath: 'index.ifc',
      })).toBe(false)
    })

    test('false for a demo permalink with an element subpath', () => {
      // processFile strips the eltPath, so the demo shape is identical.
      expect(Analytics.isRealModelOpen({
        kind: 'file',
        isUploadedFile: false,
        filepath: 'index.ifc',
        eltPath: '/81/621',
      })).toBe(false)
    })

    test('true for an uploaded file', () => {
      expect(Analytics.isRealModelOpen({
        kind: 'file',
        isUploadedFile: true,
        filepath: '6f5a9c22-0330-4f4a-a2f0-d295c07d9a3c.ifc',
      })).toBe(true)
    })

    test('true for an upload even when isUploadedFile is misdetected', () => {
      // GitHub Pages installs prefix routes with /Share, defeating
      // processFile's '/share/v/new' test — the UUID filepath still
      // distinguishes the upload from the demo.
      expect(Analytics.isRealModelOpen({
        kind: 'file',
        isUploadedFile: false,
        filepath: '6f5a9c22-0330-4f4a-a2f0-d295c07d9a3c.ifc',
      })).toBe(true)
    })

    test('true for GitHub-hosted models', () => {
      expect(Analytics.isRealModelOpen({
        kind: 'provider',
        provider: 'github',
        gitpath: 'https://github.com/bldrs-ai/test-models/blob/main/ifc/misc/box.ifc',
      })).toBe(true)
    })

    test('true for Google Drive and generic URL sources', () => {
      expect(Analytics.isRealModelOpen({kind: 'provider', provider: 'google', fileId: 'abc123'})).toBe(true)
      expect(Analytics.isRealModelOpen({kind: 'url'})).toBe(true)
    })
  })
})
