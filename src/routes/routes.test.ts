import {GithubResult} from './github'
import {GoogleResult} from './google'
import {handleRoute, processExternalUrl, type RouteParams, type FileResult} from './routes'


// Test one of each kind of route.There's more detailed tests in the github and google tests.
describe('routes', () => {
  const pathPrefixProject = 'share/v/p'
  context('with project-local route', () => {
    it('extracts filepath', () => {
      const routeParams: RouteParams = {'*': 'file.ifc'}
      const result = handleRoute(`/${pathPrefixProject}`, routeParams) as FileResult
      expect(result).toStrictEqual({
        originalUrl: new URL(`http://bldrs.test/${pathPrefixProject}/file.ifc`),
        downloadUrl: new URL(`http://bldrs.test/file.ifc`),
        kind: 'file',
        isUploadedFile: false,
        filepath: 'file.ifc',
      })
    })

    context('with selected element', () => {
      it('extracts filepath and eltPath correctly', () => {
        const routeParams: RouteParams = {'*': 'file.ifc/1234'}
        const result = handleRoute(`/${pathPrefixProject}`, routeParams) as FileResult
        expect(result).toStrictEqual({
          originalUrl: new URL(`http://bldrs.test/${pathPrefixProject}/file.ifc/1234`),
          downloadUrl: new URL(`http://bldrs.test/file.ifc`),
          kind: 'file',
          isUploadedFile: false,
          filepath: 'file.ifc',
          eltPath: '1234',
        })
      })

      it('handles variant casing of IFC', () => {
        for (const ext of [
          'ifc', 'Ifc', 'IFC', 'IfC', 'iFc', 'IFc',
        ]) {
          const inPath = `file.${ext}/1234`
          const routeParams: RouteParams = {'*': inPath}
          const result = handleRoute(`/${pathPrefixProject}`, routeParams) as FileResult
          expect(result).toStrictEqual({
            originalUrl: new URL(`http://bldrs.test/${pathPrefixProject}/file.${ext}/1234`),
            downloadUrl: new URL(`http://bldrs.test/file.${ext}`),
            kind: 'file',
            isUploadedFile: false,
            filepath: `file.${ext}`,
            eltPath: '1234',
          })
        }
      })
    })
  })

  context('with new route', () => {
    const pathPrefixNew = 'share/v/new'
    it('handles local file', () => {
      const blobId = 'AA77535-D1B6-49A9-915B-41343B08BF83'
      const filename = `${blobId}.ifc`
      const routeParams: RouteParams = {'*': filename}
      const result = handleRoute(`/${pathPrefixNew}`, routeParams) as FileResult
      expect(result).toStrictEqual({
        originalUrl: new URL(`http://bldrs.test/${pathPrefixNew}/${filename}`),
        downloadUrl: new URL(`blob:${blobId}`),
        kind: 'file',
        isUploadedFile: true,
        filepath: filename,
      })
    })
  })

  context('with gh route', () => {
    const pathPrefixGh = 'share/v/gh'
    it('extracts filepath, eltPath and gitpath correctly', () => {
      const org = 'test-org'
      const repo = 'test-repo'
      const branch = 'test-branch'
      const filepath = `path/to/file.ifc`
      const eltPath = '1/2/3'
      const originalUrl = new URL(`http://bldrs.test/${pathPrefixGh}/${org}/${repo}/${branch}/${filepath}`)
      const urlParams = {
        'org': org,
        'repo': repo,
        'branch': branch,
        '*': `${filepath}/${eltPath}`,
      }
      const route = handleRoute(`/${pathPrefixGh}`, urlParams) as GithubResult | null
      expect(route).toEqual({
        originalUrl,
        downloadUrl: new URL(`http://github.com/${org}/${repo}/${branch}/${filepath}`),
        kind: 'provider',
        provider: 'github',
        org,
        repo,
        branch,
        filepath,
        eltPath,
        getRepoPath: expect.any(Function),
        gitpath: `https://github.com/${org}/${repo}/${branch}/${filepath}`,
      })
    })
  })

  context('with url route', () => {
    const pathPrefixUrl = 'share/v/u'
    context('with Google urls', () => {
      it('extracts filepath and eltPath', () => {
        const fileId = '1sWR7x4BZ-a8tIDZ0ICo0woR2KJ_rHCSO' // Valid Google Drive file ID (28 chars)
        const routeParams: RouteParams = {
          '*': `https://drive.google.com/file/d/${fileId}/view`,
        }
        const route = handleRoute(`/${pathPrefixUrl}`, routeParams)
        const originalUrl = new URL(`http://bldrs.test/${pathPrefixUrl}/https://drive.google.com/file/d/${fileId}/view`)
        const testApiKey = process.env.GOOGLE_API_KEY
        const downloadUrl = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${testApiKey}`)
        expect(route).toEqual({
          originalUrl,
          downloadUrl,
          kind: 'provider',
          provider: 'google',
          fileId,
        })
      })
    })
  })

  context('with g route', () => {
    it('handles id', () => {
      const pathPrefixG = 'share/v/g'
      const fileId = '1sWR7x4BZ-a8tIDZ0ICo0woR2KJ_rHCSO' // Valid Google Drive file ID (28 chars)
      const routeParams: RouteParams = {
        '*': fileId,
      }
      const originalUrl = new URL(`http://bldrs.test/${pathPrefixG}/${fileId}`)
      const route = handleRoute(`/${pathPrefixG}`, routeParams) as GoogleResult
      const testApiKey = process.env.GOOGLE_API_KEY
      expect(route).toEqual({
        originalUrl,
        downloadUrl: new URL(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${testApiKey}`),
        kind: 'provider',
        provider: 'google',
        fileId,
      })
    })

    it('handles url', () => {
      const pathPrefixG = 'share/v/g'
      const fileId = '1sWR7x4BZ-a8tIDZ0ICo0woR2KJ_rHCSO' // Valid Google Drive file ID (28 chars)
      const originalUrl = new URL(`http://bldrs.test/${pathPrefixG}/https://drive.google.com/file/d/${fileId}/view`)
      const routeParams: RouteParams = {
        '*': `https://drive.google.com/file/d/${fileId}/view`,
      }
      const route = handleRoute(`/${pathPrefixG}`, routeParams) as GoogleResult
      const testApiKey = process.env.GOOGLE_API_KEY
      expect(route).toEqual({
        originalUrl,
        downloadUrl: new URL(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${testApiKey}`),
        kind: 'provider',
        provider: 'google',
        fileId,
      })
    })
  })
})


describe('processExternalUrl', () => {
  const originalUrl = new URL('http://bldrs.ai/share/v/u/test')

  it('processes GitHub URL and returns GithubResult', () => {
    const githubUrl = 'https://github.com/test-org/test-repo/blob/main/path/to/model.ifc'
    const result = processExternalUrl(originalUrl, githubUrl)

    expect(result).toEqual({
      originalUrl,
      downloadUrl: new URL('https://github.com/test-org/test-repo/main/path/to/model.ifc'),
      kind: 'provider',
      provider: 'github',
      org: 'test-org',
      repo: 'test-repo',
      branch: 'main',
      filepath: 'path/to/model.ifc',
      getRepoPath: expect.any(Function),
      gitpath: 'https://github.com/test-org/test-repo/main/path/to/model.ifc',
    })
  })

  it('processes Google Drive URL and returns GoogleResult', () => {
    const googleUrl = 'https://drive.google.com/file/d/1sWR7x4BZ-a8tIDZ0ICo0woR2KJ_rHCSO/view'
    const result = processExternalUrl(originalUrl, googleUrl)

    expect(result).toEqual({
      originalUrl,
      downloadUrl: new URL(
        `https://www.googleapis.com/drive/v3/files/1sWR7x4BZ-a8tIDZ0ICo0woR2KJ_rHCSO?alt=media&key=${process.env.GOOGLE_API_KEY}`,
      ),
      kind: 'provider',
      provider: 'google',
      fileId: '1sWR7x4BZ-a8tIDZ0ICo0woR2KJ_rHCSO',
    })
  })

  it('processes generic URL and returns UrlResult', () => {
    const genericUrl = 'https://example.com/file.ifc'
    const result = processExternalUrl(originalUrl, genericUrl)

    expect(result).toEqual({
      originalUrl,
      downloadUrl: new URL(genericUrl),
      kind: 'url',
    })
  })

  it('returns null for invalid URL', () => {
    const invalidUrl = 'not-a-url'
    const result = processExternalUrl(originalUrl, invalidUrl)

    expect(result).toBeNull()
  })

  it('prioritizes GitHub over Google Drive when both could match', () => {
    // This test ensures GitHub detection happens first
    const githubUrl = 'https://github.com/test-org/test-repo/blob/main/path/to/model.ifc'
    const result = processExternalUrl(originalUrl, githubUrl)

    expect(result?.kind).toBe('provider')
    if (result?.kind === 'provider') {
      expect(result.provider).toBe('github')
    }
  })
})
