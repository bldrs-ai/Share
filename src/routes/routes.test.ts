import {GithubResult} from './github'
import {handleRoute, type RouteParams, type FileResult} from './routes'


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
            filepath: `file.${ext}`,
            eltPath: '1234',
          })
        }
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
        const originalUrl = new URL(`http://bldrs.test/${pathPrefixUrl}/https://drive.google.com/file/d/${fileId}/view`)
        const routeParams: RouteParams = {
          '*': `https://drive.google.com/file/d/${fileId}/view`,
        }
        const route = handleRoute(`/${pathPrefixUrl}`, routeParams)
        expect(route).toEqual({
          originalUrl: new URL(`http://bldrs.test/${pathPrefixUrl}/https://drive.google.com/file/d/${fileId}/view`),
          downloadUrl: new URL(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=AIzaSyDBunWqj2zJAqXxJ6wV9BfSd-8DvJaKNpQ`),
          kind: 'provider',
          provider: 'google',
          fileId,
        })
      })
    })
  })
})
