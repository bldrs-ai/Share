/* eslint-disable no-magic-numbers */
import * as pako from 'pako'
import {
  BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME,
  BldrsElementPropertiesReader,
  captureBldrsElementProperties,
  makeLazyPayload,
} from './bldrsElementProperties'
import {
  injectGlbExtensions,
  parseGlb,
  serializeGlb,
} from './injectGlbExtensions'


describe('loader/bldrsElementProperties', () => {
  describe('captureBldrsElementProperties — null paths', () => {
    it('returns null when ifcManager is missing', async () => {
      const tree = {expressID: 1, type: 'IFCPROJECT', children: []}
      expect(await captureBldrsElementProperties(null, 0, tree)).toBeNull()
      expect(await captureBldrsElementProperties(undefined, 0, tree)).toBeNull()
    })

    it('returns null when ifcManager lacks the required methods', async () => {
      const tree = {expressID: 1, type: 'IFCPROJECT', children: []}
      expect(await captureBldrsElementProperties({}, 0, tree)).toBeNull()
      // Has getItemProperties but missing getPropertySets.
      expect(await captureBldrsElementProperties(
        {getItemProperties: () => ({})}, 0, tree)).toBeNull()
    })

    it('returns null when spatialTree is missing', async () => {
      const mgr = {
        getItemProperties: () => ({}),
        getPropertySets: () => [],
      }
      expect(await captureBldrsElementProperties(mgr, 0, null)).toBeNull()
      expect(await captureBldrsElementProperties(mgr, 0, undefined)).toBeNull()
    })

    it('returns null when spatial tree has no expressIDs', async () => {
      const mgr = {
        getItemProperties: () => ({}),
        getPropertySets: () => [],
      }
      const tree = {/* no expressID */ children: []}
      expect(await captureBldrsElementProperties(mgr, 0, tree)).toBeNull()
    })
  })

  describe('captureBldrsElementProperties — basic capture', () => {
    it('captures shallow itemProperties for each spatial-tree node', async () => {
      const tree = {
        expressID: 1, type: 'IFCPROJECT', children: [
          {expressID: 2, type: 'IFCSITE', children: []},
          {expressID: 3, type: 'IFCBUILDING', children: []},
        ],
      }
      const mgr = {
        getItemProperties: jest.fn((mid, id) => Promise.resolve({
          expressID: id,
          Name: {type: 1, value: `Entity ${id}`},
        })),
        getPropertySets: jest.fn(() => Promise.resolve([])),
      }
      const captured = await captureBldrsElementProperties(mgr, 0, tree)
      expect(captured).not.toBeNull()
      expect(Object.keys(captured.itemProperties).sort()).toEqual(['1', '2', '3'])
      expect(captured.itemProperties[1]).toEqual({
        expressID: 1, Name: {type: 1, value: 'Entity 1'},
      })
    })

    it('passes the modelID through to ifcManager calls', async () => {
      const tree = {expressID: 5, type: 'IFCPROJECT', children: []}
      const getItemProps = jest.fn(() => Promise.resolve({expressID: 5}))
      const getPsets = jest.fn(() => Promise.resolve([]))
      const mgr = {getItemProperties: getItemProps, getPropertySets: getPsets}
      await captureBldrsElementProperties(mgr, 42, tree)
      // ifcManager API: getItemProperties(modelID, expressID, indirect, recursive)
      expect(getItemProps).toHaveBeenCalledWith(42, 5, false, false)
      // ifcManager API: getPropertySets(modelID, productID, recursive)
      expect(getPsets).toHaveBeenCalledWith(42, 5, false)
    })

    it('skips entities whose getItemProperties throws (logs, continues)', async () => {
      const tree = {expressID: 1, type: 'IFCPROJECT', children: [
        {expressID: 2, type: 'IFCSITE', children: []},
        {expressID: 3, type: 'IFCBUILDING', children: []},
      ]}
      const mgr = {
        getItemProperties: jest.fn((mid, id) => {
          if (id === 2) {
            return Promise.reject(new Error('boom'))
          }
          return Promise.resolve({expressID: id})
        }),
        getPropertySets: jest.fn(() => Promise.resolve([])),
      }
      const captured = await captureBldrsElementProperties(mgr, 0, tree)
      expect(captured.itemProperties[1]).toBeDefined()
      expect(captured.itemProperties[2]).toBeUndefined() // skipped
      expect(captured.itemProperties[3]).toBeDefined()
    })
  })

  describe('captureBldrsElementProperties — ref-graph BFS', () => {
    it('follows ref-type-5 values transitively', async () => {
      // Spatial tree has one product (id=1). It references entity 100
      // via type:5; 100 references 200; 200 references 300. Closure
      // should contain {1, 100, 200, 300}.
      const tree = {expressID: 1, type: 'IFCPROJECT', children: []}
      const entities = {
        1: {expressID: 1, OwnerHistory: {type: 5, value: 100}},
        100: {expressID: 100, Material: {type: 5, value: 200}},
        200: {expressID: 200, Layer: {type: 5, value: 300}},
        300: {expressID: 300, Name: {type: 1, value: 'leaf'}},
      }
      const mgr = {
        getItemProperties: jest.fn((mid, id) => Promise.resolve(entities[id])),
        getPropertySets: jest.fn(() => Promise.resolve([])),
      }
      const captured = await captureBldrsElementProperties(mgr, 0, tree)
      expect(Object.keys(captured.itemProperties).sort()).toEqual(['1', '100', '200', '300'])
    })

    it('follows refs inside nested arrays and objects', async () => {
      // Real IFC entities frequently nest refs inside arrays (HasProperties,
      // RelatedObjects, etc.) and inside nested objects (placement chains).
      const tree = {expressID: 1, type: 'IFCPROJECT', children: []}
      const entities = {
        1: {
          expressID: 1,
          HasProperties: [
            {type: 5, value: 10},
            {type: 5, value: 11},
          ],
          Placement: {
            RelativeTo: {
              PlacementRelTo: {type: 5, value: 12},
            },
          },
        },
        10: {expressID: 10},
        11: {expressID: 11},
        12: {expressID: 12},
      }
      const mgr = {
        getItemProperties: jest.fn((mid, id) => Promise.resolve(entities[id])),
        getPropertySets: jest.fn(() => Promise.resolve([])),
      }
      const captured = await captureBldrsElementProperties(mgr, 0, tree)
      expect(Object.keys(captured.itemProperties).sort())
        .toEqual(['1', '10', '11', '12'])
    })

    it('does not loop on cycles in the ref graph', async () => {
      // a → b → c → a — closure should be {a, b, c} once, not infinite.
      const tree = {expressID: 1, type: 'IFCPROJECT', children: []}
      const entities = {
        1: {expressID: 1, Next: {type: 5, value: 2}},
        2: {expressID: 2, Next: {type: 5, value: 3}},
        3: {expressID: 3, Next: {type: 5, value: 1}}, // cycle
      }
      const mgr = {
        getItemProperties: jest.fn((mid, id) => Promise.resolve(entities[id])),
        getPropertySets: jest.fn(() => Promise.resolve([])),
      }
      const captured = await captureBldrsElementProperties(mgr, 0, tree)
      expect(Object.keys(captured.itemProperties).sort()).toEqual(['1', '2', '3'])
      // Each entity fetched exactly once despite the cycle.
      expect(mgr.getItemProperties).toHaveBeenCalledTimes(3)
    })

    it('ignores non-ref-type objects with `type` field', async () => {
      // IFC values like {type: 1, value: 'Name'} (IfcLabel) are NOT
      // references — they're typed primitives. Type 5 is the only
      // ref discriminant the writer follows.
      const tree = {expressID: 1, type: 'IFCPROJECT', children: []}
      const entities = {
        1: {
          expressID: 1,
          Name: {type: 1, value: 'IfcLabel string'}, // typed primitive, not a ref
          Description: {type: 2, value: 42}, // typed number, not a ref
        },
      }
      const mgr = {
        getItemProperties: jest.fn((mid, id) => Promise.resolve(entities[id])),
        getPropertySets: jest.fn(() => Promise.resolve([])),
      }
      const captured = await captureBldrsElementProperties(mgr, 0, tree)
      expect(Object.keys(captured.itemProperties)).toEqual(['1'])
      // Only the seed was fetched — no chasing of {type:1} or {type:2}.
      expect(mgr.getItemProperties).toHaveBeenCalledTimes(1)
    })
  })

  describe('captureBldrsElementProperties — property sets', () => {
    it('builds propertySets index from getPropertySets returns', async () => {
      const tree = {expressID: 1, type: 'IFCPROJECT', children: [
        {expressID: 100, type: 'IFCWALL', children: []},
      ]}
      const psets = [
        {expressID: 500, Name: {type: 1, value: 'Pset_WallCommon'}, HasProperties: []},
        {expressID: 501, Name: {type: 1, value: 'Pset_WallQuantities'}, HasProperties: []},
      ]
      const mgr = {
        getItemProperties: jest.fn((mid, id) => Promise.resolve({expressID: id})),
        getPropertySets: jest.fn((mid, id) => Promise.resolve(id === 100 ? psets : [])),
      }
      const captured = await captureBldrsElementProperties(mgr, 0, tree)
      expect(captured.propertySets[100]).toEqual([500, 501])
      // psets themselves are entities → in itemProperties.
      expect(captured.itemProperties[500]).toBeDefined()
      expect(captured.itemProperties[501]).toBeDefined()
    })

    it('handles a product with no psets', async () => {
      const tree = {expressID: 1, type: 'IFCPROJECT', children: []}
      const mgr = {
        getItemProperties: jest.fn(() => Promise.resolve({})),
        getPropertySets: jest.fn(() => Promise.resolve([])),
      }
      const captured = await captureBldrsElementProperties(mgr, 0, tree)
      expect(captured.propertySets).toEqual({})
    })

    it('survives getPropertySets throwing for one product (skips just that product)', async () => {
      const tree = {expressID: 1, type: 'IFCPROJECT', children: [
        {expressID: 2, type: 'IFCSITE', children: []},
      ]}
      const mgr = {
        getItemProperties: jest.fn((mid, id) => Promise.resolve({expressID: id})),
        getPropertySets: jest.fn((mid, id) => {
          if (id === 2) {
            return Promise.reject(new Error('pset error'))
          }
          return Promise.resolve([])
        }),
      }
      const captured = await captureBldrsElementProperties(mgr, 0, tree)
      // Item properties for both still captured; pset index just lacks 2.
      expect(captured.itemProperties[1]).toBeDefined()
      expect(captured.itemProperties[2]).toBeDefined()
      expect(captured.propertySets[2]).toBeUndefined()
    })
  })

  describe('makeLazyPayload — lazy decode', () => {
    /**
     * @param {object} obj data to wrap
     * @return {Uint8Array} gzipped JSON bytes
     */
    function compressed(obj) {
      return pako.gzip(new TextEncoder().encode(JSON.stringify(obj)))
    }

    it('does not decode at construction', () => {
      // The compressed input is intentionally invalid; constructor must
      // not touch it (proof that decode is truly lazy).
      const badBytes = new Uint8Array([0x42, 0x4c, 0x44, 0x52])
      const payload = makeLazyPayload(badBytes)
      expect(payload.compressed).toBe(badBytes)
      // No throw, no work done.
    })

    it('decodes on first call and caches the result', () => {
      const bytes = compressed({itemProperties: {1: {x: 1}}, propertySets: {1: [10]}})
      const payload = makeLazyPayload(bytes)
      const a = payload.decode()
      const b = payload.decode()
      expect(a).toBe(b) // same object reference — cached
      expect(a.itemProperties[1]).toEqual({x: 1})
      expect(a.propertySets[1]).toEqual([10])
    })

    it('returns empty-shape payload on a malformed compressed blob', () => {
      const payload = makeLazyPayload(new Uint8Array([0xff, 0xff, 0xff, 0xff]))
      const decoded = payload.decode()
      expect(decoded).toEqual({itemProperties: {}, propertySets: {}})
    })

    it('returns empty-shape payload on a non-object JSON payload', () => {
      const bytes = compressed([1, 2, 3])
      const payload = makeLazyPayload(bytes)
      expect(payload.decode()).toEqual({itemProperties: {}, propertySets: {}})
    })

    it('isolates missing fields — keeps the ones that ARE valid objects', () => {
      // Only itemProperties present, no propertySets.
      const bytes = compressed({itemProperties: {99: {a: 1}}})
      const decoded = makeLazyPayload(bytes).decode()
      expect(decoded.itemProperties[99]).toEqual({a: 1})
      expect(decoded.propertySets).toEqual({})
    })
  })

  describe('BldrsElementPropertiesReader', () => {
    /**
     * @param {Uint8Array} glb a GLB with extension already injected
     * @return {object} fake parser with json + getDependency
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

    it('parks a lazy payload on gltf.scene.userData', async () => {
      const data = {
        itemProperties: {1: {Name: {type: 1, value: 'X'}}},
        propertySets: {1: [2]},
      }
      const baseGlb = serializeGlb(
        {asset: {version: '2.0'}, buffers: [{byteLength: 4}]},
        new Uint8Array(4))
      const {bytes: withExt} = injectGlbExtensions(baseGlb, [
        {name: BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME, data, compress: true},
      ])
      const reader = new BldrsElementPropertiesReader(parserFromGlb(withExt))
      const gltf = {scene: {userData: {}}}
      await reader.afterRoot(gltf)
      const payload = gltf.scene.userData.bldrsElementProperties
      expect(payload).toBeDefined()
      expect(payload.compressed).toBeInstanceOf(Uint8Array)
      expect(typeof payload.decode).toBe('function')
      // Decode now and assert content.
      expect(payload.decode().itemProperties[1]).toEqual({Name: {type: 1, value: 'X'}})
      expect(payload.decode().propertySets[1]).toEqual([2])
    })

    it('is a no-op when the GLB has no extension', async () => {
      const baseGlb = serializeGlb(
        {asset: {version: '2.0'}, buffers: [{byteLength: 4}]},
        new Uint8Array(4))
      const reader = new BldrsElementPropertiesReader(parserFromGlb(baseGlb))
      const gltf = {scene: {userData: {}}}
      await reader.afterRoot(gltf)
      expect(gltf.scene.userData.bldrsElementProperties).toBeUndefined()
    })

    it('skips out-of-range bufferView without throwing', async () => {
      const json = {
        asset: {version: '2.0'},
        buffers: [{byteLength: 4}],
        bufferViews: [{buffer: 0, byteOffset: 0, byteLength: 4}],
        extensions: {
          [BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME]: {compressed: true, bufferView: 99},
        },
      }
      const reader = new BldrsElementPropertiesReader({
        json,
        getDependency: () => Promise.reject(new Error('should not be called')),
      })
      const gltf = {scene: {userData: {}}}
      await expect(reader.afterRoot(gltf)).resolves.toBe(gltf)
      expect(gltf.scene.userData.bldrsElementProperties).toBeUndefined()
    })

    it('survives a gltf with no default scene (no attach, no throw)', async () => {
      const baseGlb = serializeGlb(
        {asset: {version: '2.0'}, buffers: [{byteLength: 4}]},
        new Uint8Array(4))
      const {bytes: withExt} = injectGlbExtensions(baseGlb, [
        {name: BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME, data: {itemProperties: {}}, compress: true},
      ])
      const reader = new BldrsElementPropertiesReader(parserFromGlb(withExt))
      const gltf = {/* no .scene */}
      await expect(reader.afterRoot(gltf)).resolves.toBe(gltf)
    })
  })

  describe('end-to-end: capture → inject → reader → decode', () => {
    it('preserves the captured map through write + read', async () => {
      const tree = {
        expressID: 1, type: 'IFCPROJECT', children: [
          {expressID: 100, type: 'IFCWALL', children: []},
        ],
      }
      const entities = {
        1: {expressID: 1},
        100: {expressID: 100, Material: {type: 5, value: 999}},
        500: {expressID: 500, Name: {type: 1, value: 'Pset_WallCommon'}, HasProperties: []},
        999: {expressID: 999, Name: {type: 1, value: 'Concrete'}},
      }
      const mgr = {
        getItemProperties: (mid, id) => Promise.resolve(entities[id]),
        getPropertySets: (mid, id) => Promise.resolve(id === 100 ? [entities[500]] : []),
      }

      const captured = await captureBldrsElementProperties(mgr, 0, tree)
      expect(captured.itemProperties[100]).toBeDefined()
      expect(captured.itemProperties[999]).toBeDefined() // followed via BFS
      expect(captured.itemProperties[500]).toBeDefined() // captured via psets
      expect(captured.propertySets[100]).toEqual([500])

      const baseGlb = serializeGlb(
        {asset: {version: '2.0'}, buffers: [{byteLength: 4}]},
        new Uint8Array(4))
      const {bytes: withExt} = injectGlbExtensions(baseGlb, [
        {name: BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME, data: captured, compress: true},
      ])

      // Now read back.
      const {json, bin} = parseGlb(withExt)
      const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
      const reader = new BldrsElementPropertiesReader({
        json,
        getDependency: () => Promise.resolve(buffer),
      })
      const gltf = {scene: {userData: {}}}
      await reader.afterRoot(gltf)
      const decoded = gltf.scene.userData.bldrsElementProperties.decode()

      expect(decoded.itemProperties).toEqual(captured.itemProperties)
      expect(decoded.propertySets).toEqual(captured.propertySets)
    })
  })
})
