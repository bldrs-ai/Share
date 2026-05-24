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
      const withExt = injectGlbExtensions(baseGlb, [
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
      const withExt = injectGlbExtensions(baseGlb, [
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
