import {
  BLDRS_GLB_BATCHED_SCHEMA_VERSION,
  BLDRS_GLB_SCHEMA_VERSION,
  glbArtifactPath,
  glbCacheKey,
} from './glbCacheKey'


// The batched slot has to satisfy two properties at once, and they pull in
// opposite directions — hence pinning them together rather than apart.
//
// DISJOINT from every merged slot, or a reader half-reads the other layout.
// DERIVED from the merged version, or the documented bump ritual retires the
// slot almost nobody reads while the default-on majority keeps serving
// geometry baked by a superseded engine — the offset-homepage-logo bug in
// this module's header comment, with the cache-hit/cache-miss populations
// swapped. Both of the last two bumps (0.16.0, 0.15.0) were exactly that
// engine-coupled kind, so this is the likely failure, not a hypothetical.
//
// Re-inlining the constant as a literal keeps disjointness and silently
// drops the coupling, which is why the coupling gets its own assertion.
describe('loader/glbCacheKey — batched slot coupling', () => {
  it('derives the batched version from the merged one', () => {
    expect(BLDRS_GLB_BATCHED_SCHEMA_VERSION).toBe(`${BLDRS_GLB_SCHEMA_VERSION}-batched`)
  })

  it('starts with the merged version, so a merged bump retires it too', () => {
    // Stated separately from the equality above: that one would still pass
    // if someone "fixed" a failure by hard-coding today's derived string.
    expect(BLDRS_GLB_BATCHED_SCHEMA_VERSION.startsWith(BLDRS_GLB_SCHEMA_VERSION)).toBe(true)
    expect(BLDRS_GLB_BATCHED_SCHEMA_VERSION).not.toBe(BLDRS_GLB_SCHEMA_VERSION)
  })

  it('stays disjoint from every merged slot, so the layouts cannot alias', () => {
    const slots = [
      BLDRS_GLB_SCHEMA_VERSION,
      `${BLDRS_GLB_SCHEMA_VERSION}-draco`,
      `${BLDRS_GLB_SCHEMA_VERSION}-meshopt`,
      BLDRS_GLB_BATCHED_SCHEMA_VERSION,
    ]
    expect(new Set(slots).size).toBe(slots.length)
    // Disjointness is only meaningful at the level that decides a cache
    // hit — the filename — so assert it there too, not just on the strings.
    const paths = slots.map((ver) => glbArtifactPath('models/foo.ifc', ver))
    expect(new Set(paths).size).toBe(paths.length)
  })
})


describe('loader/glbCacheKey', () => {
  describe('glbArtifactPath', () => {
    it('replaces extension and preserves directory', () => {
      expect(glbArtifactPath('models/foo.ifc', '0.1.0')).toBe('models/foo.0.1.0.glb')
    })

    it('handles a bare filename with extension', () => {
      expect(glbArtifactPath('foo.step', '0.1.0')).toBe('foo.0.1.0.glb')
    })

    it('handles a filename without extension', () => {
      expect(glbArtifactPath('foo', '0.1.0')).toBe('foo.0.1.0.glb')
    })

    it('handles deeply nested paths', () => {
      expect(glbArtifactPath('a/b/c/d.ifc', '0.1.0')).toBe('a/b/c/d.0.1.0.glb')
    })

    it('treats a leading dot as part of the name (no extension)', () => {
      expect(glbArtifactPath('.hidden', '0.1.0')).toBe('.hidden.0.1.0.glb')
    })

    it('defaults schemaVer to BLDRS_GLB_SCHEMA_VERSION', () => {
      expect(glbArtifactPath('foo.ifc')).toBe(`foo.${BLDRS_GLB_SCHEMA_VERSION}.glb`)
    })

    it('throws on empty source path', () => {
      expect(() => glbArtifactPath('', '0.1.0')).toThrow(/sourcePath/)
    })

    it('throws on empty schemaVer', () => {
      expect(() => glbArtifactPath('foo.ifc', '')).toThrow(/schemaVer/)
    })
  })

  describe('glbCacheKey', () => {
    const args = {
      ns1: 'bldrs-ai',
      ns2: 'share',
      ns3: 'main',
      sourcePath: 'index.ifc',
      sourceHash: 'abc123',
    }

    it('returns a stable descriptor for the OPFS worker helpers', () => {
      expect(glbCacheKey(args)).toEqual({
        owner: 'bldrs-ai',
        repo: 'share',
        branch: 'main',
        originalFilePath: `index.${BLDRS_GLB_SCHEMA_VERSION}.glb`,
        commitHash: 'abc123',
        schemaVer: BLDRS_GLB_SCHEMA_VERSION,
      })
    })

    // T-3 from the design's test plan: reader and writer must derive
    // identical keys for the same source tuple.
    it('produces a byte-identical key across two callers for the same tuple', () => {
      const a = glbCacheKey(args)
      const b = glbCacheKey({...args})
      expect(a).toEqual(b)
    })

    it('changes the cache key when schemaVer changes', () => {
      const a = glbCacheKey({...args, schemaVer: '0.1.0'})
      const b = glbCacheKey({...args, schemaVer: '0.2.0'})
      expect(a.originalFilePath).not.toBe(b.originalFilePath)
    })

    it('changes the cache key when sourceHash changes', () => {
      const a = glbCacheKey({...args, sourceHash: 'aaa'})
      const b = glbCacheKey({...args, sourceHash: 'bbb'})
      expect(a.commitHash).not.toBe(b.commitHash)
    })

    it('produces different namespaces for different source kinds', () => {
      const gh = glbCacheKey({ns1: 'bldrs-ai', ns2: 'share', ns3: 'main', sourcePath: 'i.ifc', sourceHash: 'h'})
      const local = glbCacheKey({ns1: 'BldrsLocalStorage', ns2: 'V1', ns3: 'Projects', sourcePath: 'i.ifc', sourceHash: 'h'})
      expect(gh.owner).not.toBe(local.owner)
      expect(gh.repo).not.toBe(local.repo)
      expect(gh.branch).not.toBe(local.branch)
    })

    it('throws when a namespace component is empty', () => {
      expect(() => glbCacheKey({...args, ns2: ''})).toThrow(/ns2/)
      expect(() => glbCacheKey({...args, ns3: ''})).toThrow(/ns3/)
    })

    it('throws when a namespace component contains a slash', () => {
      expect(() => glbCacheKey({...args, ns2: 'share/main'})).toThrow(/ns2/)
    })

    it('throws on missing required fields', () => {
      expect(() => glbCacheKey({...args, ns1: undefined})).toThrow()
      expect(() => glbCacheKey({...args, sourceHash: undefined})).toThrow()
    })
  })
})
