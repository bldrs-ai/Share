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
  describe('captureBldrsElementProperties — fast path via Conway adapter', () => {
    // The fast path reaches into `ifcAPI.getPassthrough(modelID)` and
    // iterates the upstream Conway `IfcStepModel` synchronously,
    // calling `proxy.getLine(expressID)` per entity to convert raw
    // STEP-tape data to the wit-three-shape object consumers expect.
    // Pset extraction happens inline — `IfcRelDefinesByProperties`
    // entities encountered during the walk build the
    // product→psetIds index in one pass. No spatial tree needed.

    /**
     * Build a fake ifcManager that mimics the adapter surface:
     *   manager.ifcAPI.getPassthrough(modelID) → proxy
     *   proxy.model = [stepModel, ...]
     *   stepModel[Symbol.iterator]() → yields entities
     *   proxy.getLine(expressID) → entity-shape object
     *
     * @param {object} entitiesById flat map expressID → entity-shape
     * @return {object}
     */
    function makeFastMgr(entitiesById) {
      const ids = Object.keys(entitiesById).map(Number).sort((a, b) => a - b)
      const stepModel = {
        * [Symbol.iterator]() {
          for (const id of ids) {
            // Yield a minimal "Conway entity" — only expressID is
            // accessed by the fast loop; everything else comes from
            // proxy.getLine().
            yield {expressID: id}
          }
        },
      }
      const proxy = {
        model: [stepModel],
        getLine: (expressID) => entitiesById[expressID],
      }
      return {
        ifcAPI: {getPassthrough: (mid) => (mid === 0 ? proxy : undefined)},
      }
    }

    it('iterates all entities and produces the same itemProperties map', async () => {
      // Entities need `GlobalId` to survive the IfcRoot-reachability
      // filter — real IFC entities derived from IfcRoot (products,
      // rels, psets) all have one. Non-root entities pass through
      // only if reachable from a root via non-geometric refs.
      const entities = {
        100: {
          expressID: 100, type: 3124254112,
          GlobalId: {type: 1, value: 'g100'},
          Name: {type: 1, value: 'Wall'},
        },
        101: {
          expressID: 101, type: 3124254112,
          GlobalId: {type: 1, value: 'g101'},
          Name: {type: 1, value: 'Door'},
        },
        102: {
          expressID: 102, type: 1660063152,
          GlobalId: {type: 1, value: 'g102'},
          Name: {type: 1, value: 'Pset_Common'},
        },
      }
      const mgr = makeFastMgr(entities)
      const captured = await captureBldrsElementProperties(mgr, 0, /* unused */ null)
      expect(Object.keys(captured.itemProperties).sort()).toEqual(['100', '101', '102'])
      expect(captured.itemProperties[100]).toEqual(entities[100])
      // Pset index is empty when no IfcRelDefinesByProperties entities exist.
      expect(captured.propertySets).toEqual({})
    })

    it('builds propertySets from IfcRelDefinesByProperties entities encountered in the walk', async () => {
      // Build a relation entity. The fast path detects
      // `IfcRelDefinesByProperties` by the numeric `props.type` field
      // (= `IFCRELDEFINESBYPROPERTIES` = 4186316022) — stable across
      // wit-three's `FromTape` variants. An earlier iteration used
      // `props.constructor.name` which failed silently on real Snowdon
      // data (FromTape doesn't always produce a class with a usable
      // `name`), so the regression is pinned by setting `type` here
      // and verifying psets show up.
      /** Mimics `web-ifc`'s `IfcRelDefinesByProperties` class shape. */
      class IfcRelDefinesByProperties {
        /** @param {object} fields */
        constructor(fields) {
          Object.assign(this, fields)
        }
      }
      const relAB = new IfcRelDefinesByProperties({
        expressID: 999,
        type: 4186316022,
        GlobalId: {type: 1, value: 'g999'},
        RelatedObjects: [
          {type: 5, value: 100},
          {type: 5, value: 101},
        ],
        RelatingPropertyDefinition: {type: 5, value: 500},
      })
      const relC = new IfcRelDefinesByProperties({
        expressID: 998,
        type: 4186316022,
        GlobalId: {type: 1, value: 'g998'},
        RelatedObjects: [{type: 5, value: 102}],
        RelatingPropertyDefinition: {type: 5, value: 501},
      })
      // Walls + psets all have GlobalId (IfcRoot-derived). The
      // post-iteration filter keeps anything with GlobalId plus
      // anything reachable from those entities via non-geometric
      // refs — psets 500 / 501 are reachable through the rels'
      // RelatingPropertyDefinition refs, so they're kept too.
      const entities = {
        100: {expressID: 100, type: 3124254112, GlobalId: {type: 1, value: 'g100'}, Name: {type: 1, value: 'Wall A'}},
        101: {expressID: 101, type: 3124254112, GlobalId: {type: 1, value: 'g101'}, Name: {type: 1, value: 'Wall B'}},
        102: {expressID: 102, type: 3124254112, GlobalId: {type: 1, value: 'g102'}, Name: {type: 1, value: 'Wall C'}},
        500: {expressID: 500, type: 1660063152, GlobalId: {type: 1, value: 'g500'}, Name: {type: 1, value: 'Pset_WallCommon'}},
        501: {expressID: 501, type: 1660063152, GlobalId: {type: 1, value: 'g501'}, Name: {type: 1, value: 'Pset_QuantityTakeOff'}},
        998: relC,
        999: relAB,
      }
      const mgr = makeFastMgr(entities)
      const captured = await captureBldrsElementProperties(mgr, 0, null)
      // Walls 100 and 101 share pset 500 (via the same rel). Wall 102
      // gets pset 501 from a different rel. The pset entities
      // themselves (500, 501) and the rel entities (998, 999) also
      // land in itemProperties so the reader can deref them.
      expect(captured.propertySets[100]).toEqual([500])
      expect(captured.propertySets[101]).toEqual([500])
      expect(captured.propertySets[102]).toEqual([501])
      expect(captured.itemProperties[500]).toBeDefined()
      expect(captured.itemProperties[998]).toBe(relC)
      expect(captured.itemProperties[999]).toBe(relAB)
    })

    it('detects IfcRelDefinesByProperties by numeric type, not constructor.name', async () => {
      // Regression pin for the Snowdon 0-psets bug. Real wit-three
      // `FromTape` constructs sometimes produce plain objects (or
      // class instances whose `constructor.name` got mangled by
      // build-step minification / re-export). The fast path now
      // matches on `props.type === IFCRELDEFINESBYPROPERTIES` so
      // it's immune to either failure. We simulate by constructing
      // the rel as a plain object (no class at all) — its
      // `constructor.name === 'Object'`.
      const relAsPlainObject = {
        expressID: 999,
        type: 4186316022, // IFCRELDEFINESBYPROPERTIES
        RelatedObjects: [{type: 5, value: 100}],
        RelatingPropertyDefinition: {type: 5, value: 500},
      }
      const entities = {
        100: {expressID: 100, type: 3124254112},
        500: {expressID: 500, type: 1660063152},
        999: relAsPlainObject,
      }
      const stepModel = {
        * [Symbol.iterator]() {
          for (const id of [100, 500, 999]) {
            yield {expressID: id}
          }
        },
      }
      const proxy = {
        model: [stepModel],
        getLine: (id) => entities[id],
      }
      const mgr = {ifcAPI: {getPassthrough: () => proxy}}
      const captured = await captureBldrsElementProperties(mgr, 0, null)
      // Pre-fix: this returned `{}` because `constructor.name` was
      // 'Object'. Post-fix: type check matches, pset index built.
      expect(captured.propertySets[100]).toEqual([500])
    })

    it('de-dupes psetIds when a product appears under the same rel twice', async () => {
      /** Same shape mock as above; redefined per-test for isolation. */
      class IfcRelDefinesByProperties {
        /** @param {object} fields */
        constructor(fields) {
          Object.assign(this, fields)
        }
      }
      // Defensive: malformed IFCs occasionally double-list a product
      // under the same rel. We shouldn't push the pset id twice.
      const rel = new IfcRelDefinesByProperties({
        expressID: 999,
        type: 4186316022,
        RelatedObjects: [
          {type: 5, value: 100},
          {type: 5, value: 100}, // duplicate
        ],
        RelatingPropertyDefinition: {type: 5, value: 500},
      })
      const entities = {
        100: {expressID: 100, type: 3124254112},
        500: {expressID: 500, type: 1660063152},
        999: rel,
      }
      const mgr = makeFastMgr(entities)
      const captured = await captureBldrsElementProperties(mgr, 0, null)
      expect(captured.propertySets[100]).toEqual([500])
    })

    it('skips entities whose getLine returns undefined (sync error tolerance)', async () => {
      // GlobalId added so survivors pass the IfcRoot-reachability
      // filter (otherwise everything would prune and the assertion
      // below would trivially pass for the wrong reason).
      const entities = {
        100: {expressID: 100, type: 3124254112, GlobalId: {type: 1, value: 'g100'}, Name: {type: 1, value: 'Wall'}},
        // 101 deliberately missing → proxy.getLine(101) returns undefined.
        102: {expressID: 102, type: 3124254112, GlobalId: {type: 1, value: 'g102'}, Name: {type: 1, value: 'Door'}},
      }
      // Construct mgr that yields 101 even though entities[101] is missing.
      const stepModel = {
        * [Symbol.iterator]() {
          yield {expressID: 100}
          yield {expressID: 101}
          yield {expressID: 102}
        },
      }
      const proxy = {
        model: [stepModel],
        getLine: (id) => entities[id],
      }
      const mgr = {ifcAPI: {getPassthrough: () => proxy}}
      const captured = await captureBldrsElementProperties(mgr, 0, null)
      expect(captured.itemProperties[100]).toBeDefined()
      expect(captured.itemProperties[101]).toBeUndefined()
      expect(captured.itemProperties[102]).toBeDefined()
    })

    it('swallows per-entity throws and continues the walk', async () => {
      // A bad entry in proxy.getLine shouldn't abort the whole capture.
      const stepModel = {
        * [Symbol.iterator]() {
          yield {expressID: 100}
          yield {expressID: 101}
        },
      }
      const proxy = {
        model: [stepModel],
        getLine: (id) => {
          if (id === 100) {
            throw new Error('boom')
          }
          // GlobalId needed to survive the IfcRoot-reachability
          // filter — 101 is the entity we want to assert survives.
          return {expressID: id, type: 3124254112, GlobalId: {type: 1, value: `g${id}`}}
        },
      }
      const mgr = {ifcAPI: {getPassthrough: () => proxy}}
      const captured = await captureBldrsElementProperties(mgr, 0, null)
      expect(captured.itemProperties[100]).toBeUndefined()
      expect(captured.itemProperties[101]).toBeDefined()
    })

    it('prunes geometric primitives unreachable from any IfcRoot entity', async () => {
      // Snowdon's fast-path capture without filtering pulls in ~2.7M
      // entities (the IfcStepModel iterates EVERY parsed entity,
      // dominated by IfcCartesianPoint / IfcDirection / IfcPolyloop
      // hanging off Representation chains). The post-iteration filter
      // keeps only entities reachable from IfcRoot-derived seeds
      // (GlobalId-having) via non-geometric refs.
      //
      // This test pins the filter:
      //   - 100 has GlobalId → seed → kept
      //   - 500 reached from 100 via HasProperties → kept
      //   - 999 has no GlobalId, no incoming non-geometric ref → pruned
      //   - 1001 referenced from 100 only via Representation
      //     (geometric chain) → pruned
      const entities = {
        100: {
          expressID: 100, type: 3124254112,
          GlobalId: {type: 1, value: 'g100'},
          HasProperties: [{type: 5, value: 500}],
          Representation: {type: 5, value: 1001}, // skipped: geometric
        },
        500: {expressID: 500, type: 1660063152, Name: {type: 1, value: 'Pset'}},
        999: {expressID: 999, type: 1, Name: {type: 1, value: 'orphan'}},
        1001: {expressID: 1001, type: 1, Name: {type: 1, value: 'IfcRepresentation'}},
      }
      const mgr = makeFastMgr(entities)
      const captured = await captureBldrsElementProperties(mgr, 0, null)
      expect(captured.itemProperties[100]).toBeDefined() // root
      expect(captured.itemProperties[500]).toBeDefined() // reached via HasProperties
      expect(captured.itemProperties[999]).toBeUndefined() // orphan, pruned
      expect(captured.itemProperties[1001]).toBeUndefined() // geometric, pruned
    })

    it('falls back to slow path when fast path yields zero entities', async () => {
      // Empty stepModel — fast path returns null, slow path takes
      // over (and itself returns null because no spatial tree given).
      // Net result: null, exercising the fallback chain.
      const proxy = {
        model: [{
          [Symbol.iterator]: () => ({next: () => ({done: true, value: undefined})}),
        }],
        getLine: () => undefined,
      }
      const mgr = {
        ifcAPI: {getPassthrough: () => proxy},
        // Slow-path API surface exists too so the chain runs to its
        // null return rather than crashing.
        getItemProperties: () => Promise.resolve({}),
        getPropertySets: () => Promise.resolve([]),
      }
      const captured = await captureBldrsElementProperties(mgr, 0, null)
      expect(captured).toBeNull()
    })

    it('falls back to slow path when adapter surface is absent (test stubs etc)', async () => {
      // The existing slow-path tests rely on this: their ifcManager
      // stubs don't have `.ifcAPI`, so the fast path is unreachable
      // and the slow path takes over. Spatial tree gates the slow
      // path, so providing one + a working getItemProperties stub
      // yields a result.
      const mgr = {
        // No ifcAPI — fast path returns null.
        getItemProperties: (_mid, id) => Promise.resolve({expressID: id, name: `e${id}`}),
        getPropertySets: () => Promise.resolve([]),
      }
      const tree = {expressID: 1, type: 'IFCPROJECT', children: []}
      const captured = await captureBldrsElementProperties(mgr, 0, tree)
      expect(captured).not.toBeNull()
      expect(captured.itemProperties[1]).toBeDefined()
    })
  })

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

    it('preserves the wit-three IFC entity shape through write + read', async () => {
      // Regression pin for the user-verified shape from PR #1528's
      // deploy-preview console check: an IfcSite (expressID 621 in
      // their model) came back with the wit-three-canonical layout —
      // expressID + numeric `type` discriminant + typed primitives
      // ({type:1, value:string}) for labels + IFC references
      // ({type:5, value:expressID}) for OwnerHistory / ObjectPlacement /
      // Representation. The reader-side closure must hand back the
      // same shape so `@bldrs-ai/ifclib`'s `deref` can resolve refs.
      const tree = {
        expressID: 89, type: 'IFCPROJECT', children: [
          {expressID: 621, type: 'IFCSITE', children: []},
        ],
      }
      const ifcSiteEntity = {
        expressID: 621,
        type: 1095909175, // IFCSITE typeId from web-ifc-three; numeric
        GlobalId: {type: 1, value: '02uD5Qe8H3mek2PYnMWHk1'},
        OwnerHistory: {type: 5, value: 28},
        Name: {type: 1, value: 'Together'},
        Description: null,
        ObjectType: null,
        ObjectPlacement: {type: 5, value: 559},
        Representation: {type: 5, value: 611},
        Tag: {type: 1, value: '02E0D15A-A084-43C2-8B82-662C56811B81'},
        PredefinedType: {type: 3, value: 'NOTDEFINED'},
      }
      const ownerHistory = {
        expressID: 28,
        type: 1207048766, // IFCOWNERHISTORY
        OwningUser: {type: 5, value: 22},
        OwningApplication: {type: 5, value: 25},
      }
      const entities = {
        89: {expressID: 89, type: 103090709 /* IFCPROJECT */},
        621: ifcSiteEntity,
        28: ownerHistory,
        22: {expressID: 22, type: 1, Name: {type: 1, value: 'Owner'}},
        25: {expressID: 25, type: 1, Name: {type: 1, value: 'Bldrs'}},
        559: {expressID: 559, type: 1, RelativePlacement: {type: 5, value: 22}},
        611: {expressID: 611, type: 1, Representations: []},
      }
      const mgr = {
        getItemProperties: (mid, id) => Promise.resolve(entities[id]),
        getPropertySets: () => Promise.resolve([]),
      }

      const captured = await captureBldrsElementProperties(mgr, 0, tree)
      // BFS reaches entities via OwnerHistory's `OwningUser` /
      // `OwningApplication` refs — those field names aren't in
      // `GEOMETRIC_FIELD_NAMES`. But `ObjectPlacement` (→559) and
      // `Representation` (→611) ARE skipped, so 559 and 611 are
      // intentionally NOT in the captured map.
      expect(captured.itemProperties[621]).toEqual(ifcSiteEntity)
      expect(captured.itemProperties[28]).toEqual(ownerHistory)
      expect(captured.itemProperties[22]).toBeDefined()
      expect(captured.itemProperties[25]).toBeDefined()
      // Geometric chain entities — pruned by the geometric-field
      // skip in `collectRefIds`. Properties panel never derefs these.
      expect(captured.itemProperties[559]).toBeUndefined()
      expect(captured.itemProperties[611]).toBeUndefined()

      // Round-trip through compress + inject + parse + decode.
      const baseGlb = serializeGlb(
        {asset: {version: '2.0'}, buffers: [{byteLength: 4}]},
        new Uint8Array(4))
      const {bytes: withExt} = injectGlbExtensions(baseGlb, [
        {name: BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME, data: captured, compress: true},
      ])
      const {json, bin} = parseGlb(withExt)
      const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
      const reader = new BldrsElementPropertiesReader({
        json,
        getDependency: () => Promise.resolve(buffer),
      })
      const gltf = {scene: {userData: {}}}
      await reader.afterRoot(gltf)
      const decoded = gltf.scene.userData.bldrsElementProperties.decode()

      // Byte-for-byte (key-for-key) preservation of the IFC site shape,
      // including null-valued fields, numeric `type` discriminant, and
      // every typed-primitive / reference. This is the contract that
      // `@bldrs-ai/ifclib`'s `deref` builds the Properties panel on.
      const decodedSite = decoded.itemProperties[621]
      expect(decodedSite).toEqual(ifcSiteEntity)
      expect(decodedSite.GlobalId).toEqual({type: 1, value: '02uD5Qe8H3mek2PYnMWHk1'})
      expect(decodedSite.OwnerHistory).toEqual({type: 5, value: 28})
      expect(decodedSite.Description).toBeNull()
      expect(decodedSite.PredefinedType).toEqual({type: 3, value: 'NOTDEFINED'})

      // Following the OwnerHistory ref via the same decoded map must
      // resolve — that's the deref chain the Properties panel walks.
      const referenced = decoded.itemProperties[decodedSite.OwnerHistory.value]
      expect(referenced).toEqual(ownerHistory)
    })
  })
})
