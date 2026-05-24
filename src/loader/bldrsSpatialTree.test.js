/* eslint-disable no-magic-numbers */
import {
  BLDRS_SPATIAL_TREE_EXTENSION_NAME,
  BldrsSpatialTreeReader,
  captureBldrsSpatialTree,
} from './bldrsSpatialTree'
import {
  injectGlbExtensions,
  parseGlb,
  serializeGlb,
} from './injectGlbExtensions'


describe('loader/bldrsSpatialTree', () => {
  describe('captureBldrsSpatialTree', () => {
    it('returns null when the ifcManager is missing', async () => {
      expect(await captureBldrsSpatialTree(null, 0)).toBeNull()
      expect(await captureBldrsSpatialTree(undefined, 0)).toBeNull()
    })

    it('returns null when the ifcManager has no getSpatialStructure', async () => {
      expect(await captureBldrsSpatialTree({}, 0)).toBeNull()
    })

    it('returns null when getSpatialStructure resolves with no root', async () => {
      const mgr = {getSpatialStructure: () => null}
      expect(await captureBldrsSpatialTree(mgr, 0)).toBeNull()
    })

    it('returns null when the root has no expressID (malformed tree)', async () => {
      const mgr = {getSpatialStructure: () => ({type: 'IFCPROJECT', children: []})}
      expect(await captureBldrsSpatialTree(mgr, 0)).toBeNull()
    })

    it('returns null and swallows the error when the manager throws', async () => {
      const mgr = {
        getSpatialStructure: () => {
          throw new Error('parser state gone')
        },
      }
      // Suppress the debug().warn output during the test.
      const origWarn = console.warn
      console.warn = jest.fn()
      try {
        expect(await captureBldrsSpatialTree(mgr, 0)).toBeNull()
      } finally {
        console.warn = origWarn
      }
    })

    it('serializes a minimal valid root', async () => {
      const mgr = {
        getSpatialStructure: () => ({
          expressID: 1,
          type: 'IFCPROJECT',
          Name: {value: 'Project'},
          children: [],
        }),
      }
      expect(await captureBldrsSpatialTree(mgr, 0)).toEqual({
        expressID: 1,
        type: 'IFCPROJECT',
        Name: {value: 'Project'},
        children: [],
      })
    })

    it('preserves nested children recursively', async () => {
      const tree = {
        expressID: 1,
        type: 'IFCPROJECT',
        Name: {value: 'P'},
        children: [
          {
            expressID: 2,
            type: 'IFCSITE',
            Name: {value: 'S'},
            children: [
              {expressID: 3, type: 'IFCBUILDING', Name: {value: 'B'}, children: []},
            ],
          },
        ],
      }
      const mgr = {getSpatialStructure: () => tree}
      const captured = await captureBldrsSpatialTree(mgr, 0)
      expect(captured).toEqual(tree)
    })

    it('strips fields not in the serialization whitelist', async () => {
      // Real IfcManager output carries internal parser handles, parent
      // backrefs, raw web-ifc result objects, etc. We intentionally drop
      // anything not in the {expressID, type, Name, LongName, children}
      // set so the cache payload stays small and JSON-safe.
      const mgr = {
        getSpatialStructure: () => ({
          expressID: 1,
          type: 'IFCPROJECT',
          Name: {value: 'Project'},
          LongName: {value: 'My Project'},
          children: [],
          // junk that should be dropped:
          parent: {circular: true},
          ifcAPIRef: () => null,
          rawHandle: {_internal: true},
        }),
      }
      const captured = await captureBldrsSpatialTree(mgr, 0)
      expect(captured).toEqual({
        expressID: 1,
        type: 'IFCPROJECT',
        Name: {value: 'Project'},
        LongName: {value: 'My Project'},
        children: [],
      })
      expect(captured.parent).toBeUndefined()
      expect(captured.ifcAPIRef).toBeUndefined()
      expect(captured.rawHandle).toBeUndefined()
    })

    it('threads the modelID through to getSpatialStructure', async () => {
      const mgr = {
        getSpatialStructure: jest.fn(() => ({
          expressID: 1, type: 'IFCPROJECT', children: [],
        })),
      }
      await captureBldrsSpatialTree(mgr, 42)
      expect(mgr.getSpatialStructure).toHaveBeenCalledWith(42, true)
    })
  })

  describe('BldrsSpatialTreeReader', () => {
    /**
     * Build a fake GLTFLoader `parser` over the supplied {json, bin}
     * pair, sufficient for `afterRoot` to resolve its `getDependency`
     * call. Mirrors how `ExtBldrsPropertiesPayload` is tested implicitly
     * (via the live GLTFLoader); the simpler stub here keeps the test
     * a unit of the extension's decode logic.
     *
     * @param {Uint8Array} glb
     * @return {object}
     */
    function parserFromGlb(glb) {
      const {json, bin} = parseGlb(glb)
      const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
      return {
        json,
        getDependency: (kind, _index) => {
          if (kind !== 'buffer') {
            return Promise.reject(new Error(`unexpected dep kind ${kind}`))
          }
          return Promise.resolve(buffer)
        },
      }
    }

    it('decodes a tree round-tripped through injectGlbExtensions', async () => {
      const tree = {
        expressID: 1,
        type: 'IFCPROJECT',
        Name: {value: 'Project'},
        children: [
          {expressID: 2, type: 'IFCSITE', Name: {value: 'Site'}, children: []},
        ],
      }
      const baseGlb = serializeGlb(
        {asset: {version: '2.0'}, buffers: [{byteLength: 4}]},
        new Uint8Array(4))
      const {bytes: withExt} = injectGlbExtensions(baseGlb, [
        {name: BLDRS_SPATIAL_TREE_EXTENSION_NAME, data: tree, compress: true},
      ])

      const reader = new BldrsSpatialTreeReader(parserFromGlb(withExt))
      const gltf = {scene: {userData: {}}}
      await reader.afterRoot(gltf)

      expect(gltf.scene.userData.bldrsSpatialTree).toEqual(tree)
      expect(reader.spatialTree).toEqual(tree)
    })

    it('is a no-op when the GLB has no BLDRS_spatial_tree extension', async () => {
      const baseGlb = serializeGlb(
        {asset: {version: '2.0'}, buffers: [{byteLength: 4}]},
        new Uint8Array(4))
      const reader = new BldrsSpatialTreeReader(parserFromGlb(baseGlb))
      const gltf = {scene: {userData: {}}}
      await reader.afterRoot(gltf)
      expect(gltf.scene.userData.bldrsSpatialTree).toBeUndefined()
      expect(reader.spatialTree).toBeNull()
    })

    it('reports its extension name', () => {
      const reader = new BldrsSpatialTreeReader({json: {}})
      expect(reader.name).toBe(BLDRS_SPATIAL_TREE_EXTENSION_NAME)
      expect(reader.name).toBe('BLDRS_spatial_tree')
    })

    it('skips an out-of-range bufferView index without throwing', async () => {
      // Hostile / malformed cache file: extension claims bufferView 99
      // but only one bufferView exists. Without the guard, the next line
      // would crash on `json.bufferViews[99].buffer`.
      const json = {
        asset: {version: '2.0'},
        buffers: [{byteLength: 4}],
        bufferViews: [{buffer: 0, byteOffset: 0, byteLength: 4}],
        extensionsUsed: [BLDRS_SPATIAL_TREE_EXTENSION_NAME],
        extensions: {
          [BLDRS_SPATIAL_TREE_EXTENSION_NAME]: {compressed: true, bufferView: 99},
        },
      }
      const reader = new BldrsSpatialTreeReader({
        json,
        getDependency: () => Promise.reject(new Error('should not be called')),
      })
      const gltf = {scene: {userData: {}}}
      await expect(reader.afterRoot(gltf)).resolves.toBe(gltf)
      expect(gltf.scene.userData.bldrsSpatialTree).toBeUndefined()
      expect(reader.spatialTree).toBeNull()
    })

    it('skips a non-integer bufferView index without throwing', async () => {
      const json = {
        asset: {version: '2.0'},
        buffers: [{byteLength: 4}],
        bufferViews: [{buffer: 0, byteOffset: 0, byteLength: 4}],
        extensions: {
          [BLDRS_SPATIAL_TREE_EXTENSION_NAME]: {compressed: true, bufferView: 'one'},
        },
      }
      const reader = new BldrsSpatialTreeReader({
        json,
        getDependency: () => Promise.reject(new Error('should not be called')),
      })
      await reader.afterRoot({scene: {userData: {}}})
      expect(reader.spatialTree).toBeNull()
    })

    it('survives a gltf with no default scene (no attach, no throw)', async () => {
      // Multi-scene glTF with no `scene` index is spec-legal. Without
      // the null guard, `gltf.scene.userData = …` throws TypeError.
      const tree = {expressID: 1, type: 'IFCPROJECT', children: []}
      const baseGlb = serializeGlb(
        {asset: {version: '2.0'}, buffers: [{byteLength: 4}]},
        new Uint8Array(4))
      const {bytes: withExt} = injectGlbExtensions(baseGlb, [
        {name: BLDRS_SPATIAL_TREE_EXTENSION_NAME, data: tree, compress: true},
      ])
      const reader = new BldrsSpatialTreeReader(parserFromGlb(withExt))
      const gltf = {/* no .scene */}
      await expect(reader.afterRoot(gltf)).resolves.toBe(gltf)
      // The decoded tree still hangs off the reader instance so callers
      // with a non-standard glTF shape can still recover it.
      expect(reader.spatialTree).toEqual(tree)
    })

    it('rejects a decoded payload that is not an object', async () => {
      // Hostile cache file: the payload decodes to a JSON array (or
      // a primitive). `validateDecodedTree` returns null; reader leaves
      // the userData unset.
      const baseGlb = serializeGlb(
        {asset: {version: '2.0'}, buffers: [{byteLength: 4}]},
        new Uint8Array(4))
      const {bytes: withExt} = injectGlbExtensions(baseGlb, [
        {name: BLDRS_SPATIAL_TREE_EXTENSION_NAME, data: [1, 2, 3]},
      ])
      const reader = new BldrsSpatialTreeReader(parserFromGlb(withExt))
      const gltf = {scene: {userData: {}}}
      await reader.afterRoot(gltf)
      expect(gltf.scene.userData.bldrsSpatialTree).toBeNull()
      expect(reader.spatialTree).toBeNull()
    })

    it('rejects a decoded payload missing expressID', async () => {
      const baseGlb = serializeGlb(
        {asset: {version: '2.0'}, buffers: [{byteLength: 4}]},
        new Uint8Array(4))
      const {bytes: withExt} = injectGlbExtensions(baseGlb, [
        {name: BLDRS_SPATIAL_TREE_EXTENSION_NAME, data: {type: 'IFCPROJECT'}},
      ])
      const reader = new BldrsSpatialTreeReader(parserFromGlb(withExt))
      const gltf = {scene: {userData: {}}}
      await reader.afterRoot(gltf)
      expect(reader.spatialTree).toBeNull()
    })
  })

  describe('serialization depth ceiling', () => {
    it('truncates a tree past MAX_TREE_DEPTH to keep the JS stack safe', async () => {
      // Build a 150-level deep linear chain — past the 100-level
      // ceiling. The capture should succeed (no throw) and the
      // resulting tree should be truncated to MAX_TREE_DEPTH levels.
      let node = {expressID: 999, type: 'IFCSPACE', children: []}
      for (let i = 998; i >= 0; i--) {
        node = {expressID: i, type: 'IFCSPACE', children: [node]}
      }
      const mgr = {getSpatialStructure: () => node}
      const captured = await captureBldrsSpatialTree(mgr, 0)
      expect(captured).not.toBeNull()
      // Walk the resulting tree, count depth.
      let depth = 0
      let cursor = captured
      while (cursor && cursor.children && cursor.children.length > 0) {
        cursor = cursor.children[0]
        depth++
      }
      // Depth is 0-based; root is depth 0. Past 100 levels we truncate
      // by dropping the recursive `children` push. Exact terminal
      // depth depends on whether the leaf is included; cap at 100.
      expect(depth).toBeLessThanOrEqual(100)
    })
  })

  describe('end-to-end: capture → inject → reader', () => {
    it('preserves the captured tree through write+read', async () => {
      const mgr = {
        getSpatialStructure: () => ({
          expressID: 100,
          type: 'IFCPROJECT',
          Name: {value: 'E2E'},
          LongName: {value: 'End to end project'},
          children: [
            {expressID: 200, type: 'IFCSITE', Name: {value: 'Site'}, children: []},
            {expressID: 300, type: 'IFCBUILDING', Name: {value: 'Building'}, children: []},
          ],
        }),
      }
      const tree = await captureBldrsSpatialTree(mgr, 0)
      expect(tree).not.toBeNull()

      const baseGlb = serializeGlb(
        {asset: {version: '2.0'}, buffers: [{byteLength: 4}]},
        new Uint8Array(4))
      const {bytes: withExt} = injectGlbExtensions(baseGlb, [
        {name: BLDRS_SPATIAL_TREE_EXTENSION_NAME, data: tree, compress: true},
      ])

      const {json} = parseGlb(withExt)
      expect(json.extensionsUsed).toContain(BLDRS_SPATIAL_TREE_EXTENSION_NAME)
      expect(json.extensions[BLDRS_SPATIAL_TREE_EXTENSION_NAME]).toMatchObject({
        compressed: true,
      })

      // Round-trip via the reader.
      const buffer = parseGlb(withExt).bin.buffer.slice(
        parseGlb(withExt).bin.byteOffset,
        parseGlb(withExt).bin.byteOffset + parseGlb(withExt).bin.byteLength,
      )
      const reader = new BldrsSpatialTreeReader({
        json,
        getDependency: () => buffer,
      })
      const gltf = {scene: {userData: {}}}
      await reader.afterRoot(gltf)
      expect(gltf.scene.userData.bldrsSpatialTree).toEqual(tree)
    })
  })
})
