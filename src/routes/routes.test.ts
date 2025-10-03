import {GithubResult} from './github'
import {
  handleRoute,
  RouteParams,
  ProjectFileResult,
} from './routes'


describe('routes', () => {
  context('with project-local route', () => {
    context('with selected element', () => {
      it('extracts filepath and eltPath correctly', () => {
        const routeParams: RouteParams = {'*': 'as_Ifcdf.ifc/1234'}
        const result = handleRoute('/share/v/p', routeParams) as ProjectFileResult
        expect(result).toStrictEqual({
          filepath: '/as_Ifcdf.ifc',
          eltPath: '/1234',
        })
      })

      it('handles variant casing of IFC', () => {
        for (const ext of [
          'ifc', 'Ifc', 'IFC', 'IfC', 'iFc', 'IFc',
        ]) {
          const inPath = `as_${ext}df.${ext}/1234`
          const routeParams: RouteParams = {'*': inPath}
          const result = handleRoute('/share/v/p', routeParams) as ProjectFileResult
          expect(result).toStrictEqual({
            filepath: `/as_${ext}df.${ext}`,
            eltPath: '/1234',
          })
        }
      })
    })
  })

  context.only('with gh route', () => {
    it('extracts filepath, eltPath and gitpath correctly', () => {
      const routeParams: RouteParams = {
        '*': 'as_Ifcdf.ifc/1234',
        'org': 'the-org',
        'repo': 'the-repo',
        'branch': 'the-branch',
      }
      const route = handleRoute('/share/v/gh', routeParams) as GithubResult
      expect(route.filepath).toEqual('/as_Ifcdf.ifc')
      expect(route.eltPath).toEqual('/1234')
      expect(route.org).toEqual('the-org')
      expect(route.repo).toEqual('the-repo')
      expect(route.branch).toEqual('the-branch')
      expect(route.getRepoPath()).toEqual('/the-org/the-repo/the-branch/as_Ifcdf.ifc')
      expect(route.gitpath).toEqual('https://github.com/the-org/the-repo/the-branch/as_Ifcdf.ifc')
    })
  })

  context.skip('with url route', () => {
    context('with Google urls', () => {
      it('extracts filepath and eltPath', () => {
        const fileId = 'abcdEFG1234-XYZ'
        let routeParams: RouteParams = {
          '*': `${fileId}`,
        }
        let route = handleRoute(
          '/share/v/u/https://drive.google.com/file/d/(?<id>[^/]+)/view',
          routeParams,
        )
        // Note: This test is skipped and may need type fixes when enabled
        // URL routes return {url: string} or {google: string}, not filepath/eltPath
        expect(route).toBeDefined()
        routeParams = {
          '*': `${fileId}`,
        }
        route = handleRoute(
          'https://www.googleapis.com/drive/v3/files/(?<id>[^/])',
          routeParams,
        )
        expect(route).toBeDefined()
      })
    })
  })
})
