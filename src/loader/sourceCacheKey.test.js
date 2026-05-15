import {
  externalCacheKey,
  gitHubCacheKey,
  googleDriveCacheKey,
  localCacheKey,
  uploadCacheKey,
} from './sourceCacheKey'
import {glbCacheKey} from './glbCacheKey'


describe('loader/sourceCacheKey', () => {
  it('gitHubCacheKey reuses (owner, repo, branch) so the GLB sits next to its source IFC', () => {
    const args = gitHubCacheKey({owner: 'bldrs-ai', repo: 'share', branch: 'main', filePath: 'i.ifc', shaHash: 'h'})
    expect(args).toEqual({ns1: 'bldrs-ai', ns2: 'share', ns3: 'main', sourcePath: 'i.ifc', sourceHash: 'h'})
    // Round-trip through glbCacheKey to ensure it accepts our output.
    expect(() => glbCacheKey(args)).not.toThrow()
  })

  it('localCacheKey targets BldrsLocalStorage/V1/Projects (same as downloadToOPFS)', () => {
    const args = localCacheKey({filePath: 'index.ifc', contentSha: 'abc'})
    expect(args.ns1).toBe('BldrsLocalStorage')
    expect(args.ns2).toBe('V1')
    expect(args.ns3).toBe('Projects')
    expect(() => glbCacheKey(args)).not.toThrow()
  })

  it('uploadCacheKey targets the same dir as locally-hosted files', () => {
    const u = uploadCacheKey({filePath: 'abc.ifc', contentSha: 'sha'})
    const l = localCacheKey({filePath: 'abc.ifc', contentSha: 'sha'})
    expect(u).toEqual(l)
  })

  it('externalCacheKey targets the same dir; sourceHash provides per-host isolation', () => {
    const a = externalCacheKey({filePath: 'm.ifc', contentSha: 'h1'})
    const b = externalCacheKey({filePath: 'm.ifc', contentSha: 'h2'})
    expect(a.ns1).toBe(b.ns1)
    expect(a.ns2).toBe(b.ns2)
    expect(a.ns3).toBe(b.ns3)
    expect(a.sourceHash).not.toBe(b.sourceHash)
    expect(() => glbCacheKey(a)).not.toThrow()
  })

  it('googleDriveCacheKey targets the shared local dir', () => {
    const args = googleDriveCacheKey({filePath: 'm.ifc', contentSha: 'h'})
    expect(args.ns1).toBe('BldrsLocalStorage')
    expect(args.ns2).toBe('V1')
    expect(args.ns3).toBe('Projects')
    expect(() => glbCacheKey(args)).not.toThrow()
  })

  it('GitHub artifacts live in a different dir than local/upload/external', () => {
    const gh = glbCacheKey(gitHubCacheKey({owner: 'o', repo: 'r', branch: 'b', filePath: 'x.ifc', shaHash: 'h'}))
    const local = glbCacheKey(localCacheKey({filePath: 'x.ifc', contentSha: 'h'}))
    expect(gh.owner).not.toBe(local.owner)
  })
})
