import processGoogleUrl from './google'


describe('processGoogleUrl', () => {
  describe('valid Google Drive URLs', () => {
    type UrlPattern = 'api' | 'apiAltMedia' | 'download' | 'edit' | 'preview' | 'view' | 'viewWithSharing'

    const patterns: Record<UrlPattern, (id: string) => string> = {
      // Drive
      download: (id) => `https://drive.google.com/uc?id=${id}&export=download`,
      edit: (id) => `https://drive.google.com/file/d/${id}/edit`,
      preview: (id) => `https://drive.google.com/file/d/${id}/preview`,
      view: (id) => `https://drive.google.com/file/d/${id}/view`,
      viewWithSharing: (id) => `https://drive.google.com/file/d/${id}/view?usp=sharing`,
      // Google Drive APIs
      api: (id) => `https://www.googleapis.com/drive/v3/files/${id}`,
      apiAltMedia: (id) => `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
    }

    /**
     * Expands a Google Drive ID to a URL.
     *
     * @param id - The Google Drive ID to expand.
     * @param idPatternMap - The map of IDs to patterns.
     * @return The expanded URL.
     */
    function expandUrl(id: string, idPatternMap: Record<string, UrlPattern>): string {
      const pattern = idPatternMap[id]
      return pattern ? patterns[pattern](id) : ''
    }
    const idPatternMap: Record<string, UrlPattern> = {
      // Makes url like https://drive.google.com/file/d/1sWR7x4BZ-a8tIDZ0ICo0woR2KJ_rHCSO/view
      '1sWR7x4BZ-a8tIDZ0ICo0woR2KJ_rHCSO': 'view',
      '2sWR7x4BZ-a8tIDZ0ICo0woR2KJ_rHCSO': 'viewWithSharing',
      '3sWR7x4BZ-a8tIDZ0ICo0woR2KJ_rHCSO': 'edit',
      '4sWR7x4BZ-a8tIDZ0ICo0woR2KJ_rHCSO': 'download',
      '5sWR7x4BZ-a8tIDZ0ICo0woR2KJ_rHCSO': 'preview',
      // Makes url like https://www.googleapis.com/drive/v3/files/0B1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ
      '0B1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ': 'api',
      '1B1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ': 'apiAltMedia',
    }

    Object.keys(idPatternMap).forEach((id) => {
      const url = expandUrl(id, idPatternMap)
      it(`should extract file ID from ${url}`, () => {
        const u = new URL(url)
        const result = processGoogleUrl(u)
        expect(result).toEqual({
          kind: 'provider',
          provider: 'google',
          fileId: id,
          sourceUrl: u,
        })
      })
    })
  })

  describe('invalid URLs', () => {
    const invalidUrls = [
      'https://github.com/user/repo/file.txt',
      'https://example.com/file.pdf',
      'https://drive.google.com/file/',
      'https://drive.google.com/drive/my-drive',
      'https://drive.google.com/file/d/invalid-id-format/view',
    ]
    invalidUrls.forEach((url) => {
      it(`should return null for ${url || 'empty string'}`, () => {
        const result = processGoogleUrl(new URL(url))
        expect(result).toBeNull()
      })
    })
  })
})
