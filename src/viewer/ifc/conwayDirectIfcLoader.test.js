// Unit tests for the Conway-direct IFC parse path (Slice 5b of
// design/new/viewer-replacement.md). Covers `parseIfcWithConway`
// (OpenModel + StreamAllMeshes capture) + the property-method
// closures `decorateConwayDirectIfcModel` attaches.
//
// `decorateConwayDirectIfcModel`'s BVH + IfcInstanceMap wiring is
// exercised through the existing integration tests in
// `Loader.test.js` (full load pipeline) — this file pins the
// pieces that don't need a real BufferGeometry to validate.

import {Mesh} from 'three'
import {
  decorateConwayDirectIfcModel,
  parseIfcWithConway,
} from './conwayDirectIfcLoader'

// Controllable flag surface: defaults to "everything off" (matching
// the real module for every flag these tests touch except
// `streamOpen`, whose default-on is pinned separately against the
// real module below). The open-path tests flip it per case.
const mockIsFeatureEnabled = jest.fn()
jest.mock('../../FeatureFlags', () => ({
  isFeatureEnabled: (name) => mockIsFeatureEnabled(name),
}))


/* eslint-disable no-magic-numbers */
describe('viewer/ifc/conwayDirectIfcLoader', () => {
  // The demand-pump boundary logs are always-on (they must reach a
  // user's console without a flag), so divert them rather than let the
  // suite narrate every parse. PLAYBOOK.md §"Keep the test console clean".
  let infoSpy
  let warnSpy

  beforeEach(() => {
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {})
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    infoSpy.mockRestore()
    warnSpy.mockRestore()
  })

  describe('parseIfcWithConway', () => {
    it('returns the modelID + captured FlatMeshes from a single Conway OpenModel + StreamAllMeshes pass', async () => {
      const fakeFlatMesh1 = {expressID: 42, geometries: {size: () => 0}}
      const fakeFlatMesh2 = {expressID: 43, geometries: {size: () => 0}}
      const ifcAPI = {
        wasmModule: {}, // already initialised — skips the Init branch
        OpenModel: jest.fn(() => 0),
        StreamAllMeshes: jest.fn((modelID, cb) => {
          cb(fakeFlatMesh1)
          cb(fakeFlatMesh2)
        }),
      }
      const buffer = new ArrayBuffer(8)
      const result = await parseIfcWithConway(buffer, ifcAPI)
      expect(result.modelID).toBe(0)
      expect(result.captured).toEqual([fakeFlatMesh1, fakeFlatMesh2])
      // OpenModel called with a Uint8Array view of the buffer + the
      // default settings (COORDINATE_TO_ORIGIN matches what wit-three's
      // `applyWebIfcConfig` was setting before Slice 5b).
      expect(ifcAPI.OpenModel).toHaveBeenCalledTimes(1)
      const [data, settings] = ifcAPI.OpenModel.mock.calls[0]
      expect(data).toBeInstanceOf(Uint8Array)
      expect(settings).toEqual({COORDINATE_TO_ORIGIN: true, USE_FAST_BOOLS: true})
    })

    it('accepts a Uint8Array buffer directly without re-wrapping', async () => {
      const ifcAPI = {
        wasmModule: {},
        OpenModel: jest.fn(() => 1),
        StreamAllMeshes: jest.fn(),
      }
      const bytes = new Uint8Array([1, 2, 3])
      await parseIfcWithConway(bytes, ifcAPI)
      // The Uint8Array passed to OpenModel should be the same
      // reference we handed in — re-wrapping would lose buffer
      // ownership semantics for callers that rely on it.
      expect(ifcAPI.OpenModel.mock.calls[0][0]).toBe(bytes)
    })

    it('lazily Inits Conway when wasmModule is undefined — first-load dance', async () => {
      // Regression pin: pre-Slice-5b wit-three's `IFCLoader.parse`
      // did `if (wasmModule === undefined) await Init()`. We dropped
      // that call site; without re-doing it here, `OpenModel`
      // returns -1 on the first cache-miss load of any session.
      // Verified live on a fresh-page IFC load.
      const initOrder = []
      const ifcAPI = {
        wasmModule: undefined,
        // Returns a Promise but no actual await needed; eslint
        // require-await doesn't fire on explicit `Promise.resolve()`.
        Init: jest.fn(() => {
          initOrder.push('init')
          ifcAPI.wasmModule = {ready: true}
          return Promise.resolve()
        }),
        OpenModel: jest.fn(() => {
          initOrder.push('openModel')
          return 0
        }),
        StreamAllMeshes: jest.fn(),
      }
      await parseIfcWithConway(new ArrayBuffer(0), ifcAPI)
      expect(ifcAPI.Init).toHaveBeenCalledTimes(1)
      // Order matters: Init must complete before OpenModel runs.
      expect(initOrder).toEqual(['init', 'openModel'])
    })

    it('skips Init when wasmModule is already present', async () => {
      const ifcAPI = {
        wasmModule: {ready: true},
        Init: jest.fn(),
        OpenModel: jest.fn(() => 0),
        StreamAllMeshes: jest.fn(),
      }
      await parseIfcWithConway(new ArrayBuffer(0), ifcAPI)
      expect(ifcAPI.Init).not.toHaveBeenCalled()
    })

    it('throws when the IfcAPI lacks OpenModel', async () => {
      await expect(parseIfcWithConway(new ArrayBuffer(0), {})).rejects.toThrow(
        /OpenModel is unavailable/)
    })

    it('throws when the IfcAPI lacks StreamAllMeshes', async () => {
      await expect(parseIfcWithConway(new ArrayBuffer(0), {
        OpenModel: () => 0,
      })).rejects.toThrow(/StreamAllMeshes is unavailable/)
    })

    it('throws when OpenModel returns a negative modelID (Conway parse failure)', async () => {
      const ifcAPI = {
        wasmModule: {},
        OpenModel: jest.fn(() => -1),
        StreamAllMeshes: jest.fn(),
      }
      await expect(parseIfcWithConway(new ArrayBuffer(0), ifcAPI)).rejects.toThrow(
        /OpenModel returned -1/)
      expect(ifcAPI.StreamAllMeshes).not.toHaveBeenCalled()
    })

    it('forwards custom settings to OpenModel when provided', async () => {
      const ifcAPI = {
        wasmModule: {},
        OpenModel: jest.fn(() => 0),
        StreamAllMeshes: jest.fn(),
      }
      const settings = {COORDINATE_TO_ORIGIN: false, USE_FAST_BOOLS: false}
      await parseIfcWithConway(new ArrayBuffer(0), ifcAPI, settings)
      expect(ifcAPI.OpenModel.mock.calls[0][1]).toBe(settings)
    })

    describe('demandGeometry deferred open + batch pump (slice A)', () => {
      beforeEach(() => mockIsFeatureEnabled.mockReset())
      afterAll(() => mockIsFeatureEnabled.mockReset())

      /**
       * @param {number} products total products the fake engine holds
       * @return {object} IfcAPI stub with the deferred pump surface
       */
      function makeDemandAPI(products) {
        let cursor = 0
        return {
          wasmModule: {},
          OpenModelStreamed: jest.fn(() => Promise.resolve(5)),
          OpenModelAsync: jest.fn(() => Promise.resolve(8)),
          OpenModel: jest.fn(() => 9),
          StreamAllMeshes: jest.fn(),
          ExtractGeometryBatch: jest.fn((modelID, batchSize, cb) => {
            const take = Math.min(batchSize, products - cursor)
            for (let i = 0; i < take; i++) {
              cb({expressID: 1000 + cursor + i, geometries: {size: () => 1}})
            }
            cursor += take
            return {extracted: take, remaining: products - cursor}
          }),
        }
      }

      it('opens deferred and pumps batches to completion', async () => {
        mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
        const ifcAPI = makeDemandAPI(150)
        const batches = []
        const result = await parseIfcWithConway(
          new ArrayBuffer(4), ifcAPI, undefined, undefined, (batch) => batches.push(batch.length))
        expect(result.modelID).toBe(5)
        // Deferred settings rode the open.
        const [, settings] = ifcAPI.OpenModelStreamed.mock.calls[0]
        expect(settings.DEFER_GEOMETRY).toBe(true)
        // The residency budget rides on the deferred path only, and is what
        // keeps the wasm high-water bounded (PSB: 1284 MB -> 298 MB).
        expect(settings.GEOMETRY_BUDGET_MB).toBe(64)
        // 150 products in batches of 64 → 3 extraction rounds, streamed
        // incrementally. Nothing accumulates: `onMeshBatch` took delivery,
        // so retaining a second reference to the same FlatMeshes is the
        // 475 MB conway#638 exists to stop.
        expect(result.captured).toHaveLength(0)
        expect(batches).toEqual([64, 64, 22])
        // The one-shot capture path is not used on this branch.
        expect(ifcAPI.StreamAllMeshes).not.toHaveBeenCalled()
      })

      it('reports a Geometry progress stage across the demand pump', async () => {
        mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
        const ifcAPI = makeDemandAPI(150)
        const progress = []
        await parseIfcWithConway(
          new ArrayBuffer(4), ifcAPI, undefined, (event) => progress.push(event))
        const geometry = progress.filter((event) => event.phase === 'geometry')
        expect(geometry.length).toBeGreaterThan(1)
        expect(geometry[0]).toMatchObject({completed: 0, total: 150, unit: 'products'})
        expect(geometry[geometry.length - 1]).toMatchObject({completed: 150, total: 150})
        expect(geometry.every((event) => event.elapsedMs === undefined)).toBe(true)
      })

      it('falls through to the classic selection when the engine lacks the pump', async () => {
        mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
        const ifcAPI = makeDemandAPI(10)
        delete ifcAPI.ExtractGeometryBatch
        const result = await parseIfcWithConway(new ArrayBuffer(4), ifcAPI)
        // Classic streamed open (no defer), one-shot capture.
        expect(result.modelID).toBe(5)
        const [, settings] = ifcAPI.OpenModelStreamed.mock.calls[0]
        expect(settings?.DEFER_GEOMETRY).toBeUndefined()
        // ...and never on the classic path, which does not pump and would
        // have geometry evicted from under a consumer reading it later.
        expect(settings?.GEOMETRY_BUDGET_MB).toBeUndefined()
        expect(ifcAPI.StreamAllMeshes).toHaveBeenCalledTimes(1)
      })

      it('stays on the classic path when the flag is off', async () => {
        mockIsFeatureEnabled.mockImplementation(() => false)
        const ifcAPI = makeDemandAPI(10)
        await parseIfcWithConway(new ArrayBuffer(4), ifcAPI)
        expect(ifcAPI.ExtractGeometryBatch).not.toHaveBeenCalled()
        expect(ifcAPI.StreamAllMeshes).toHaveBeenCalledTimes(1)
      })

      it('disableStreamOpen also disables the demand path', async () => {
        mockIsFeatureEnabled.mockImplementation(
          (name) => name === 'demandGeometry' || name === 'disableStreamOpen')
        const ifcAPI = makeDemandAPI(10)
        const result = await parseIfcWithConway(new ArrayBuffer(4), ifcAPI)
        // Full classic fallback: OpenModelAsync, not the deferred open.
        expect(result.modelID).toBe(8)
        expect(ifcAPI.ExtractGeometryBatch).not.toHaveBeenCalled()
      })

      it('demandGeometry flag exists (temporarily default-on for branch burn-in)', () => {
        // Default-off is the mainline contract; this branch flips it on so
        // DnD loads (which can't carry ?feature=) exercise the demand path.
        // Restore the isActive=false assertion before merging to main.
        const {flags} = jest.requireActual('../../FeatureFlags')
        const flag = flags.find((f) => f.name === 'demandGeometry')
        expect(flag).toBeDefined()
        expect(flag.isActive).toBe(true)
      })

      it('serves the one-shot capture when the pump no-ops (internal classic fallback)', async () => {
        // Conway falls back internally to a classic fully-extracted open on
        // any streamed-parse failure, and its pump then returns {0,0}
        // immediately. The loader must serve StreamAllMeshes then, not an
        // empty scene.
        //
        // This is NOT the STEP case it was once written as: conway routes
        // AP214/AP203/AP242 with DEFER_GEOMETRY through
        // `IfcApiProxyAP214.createDeferred`
        // (`ifc_api_model_passthrough_factory.ts`), pinned engine-side by
        // `ap214_streamed_open.test.ts`, so STEP pumps like IFC does.
        mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
        const ifcAPI = makeDemandAPI(10)
        ifcAPI.ExtractGeometryBatch = jest.fn(() => ({extracted: 0, remaining: 0}))
        ifcAPI.StreamAllMeshes = jest.fn((modelID, cb) => {
          for (let i = 0; i < 5; i++) {
            cb({expressID: 2000 + i, geometries: {size: () => 1}})
          }
        })
        const batches = []
        const result = await parseIfcWithConway(
          new ArrayBuffer(4), ifcAPI, undefined, undefined, (batch) => batches.push(batch.length))
        expect(result.captured).toHaveLength(5)
        expect(ifcAPI.StreamAllMeshes).toHaveBeenCalledTimes(1)
        // No preview batches for an already-complete extraction.
        expect(batches).toEqual([])
      })

      it('threads onPreviewMesh into the deferred open as ON_PREVIEW_MESH (slice A2)', async () => {
        mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
        const ifcAPI = makeDemandAPI(10)
        const onPreviewMesh = jest.fn()
        await parseIfcWithConway(
          new ArrayBuffer(4), ifcAPI, undefined, undefined, undefined, onPreviewMesh)
        const [, settings] = ifcAPI.OpenModelStreamed.mock.calls[0]
        expect(settings.DEFER_GEOMETRY).toBe(true)
        expect(settings.ON_PREVIEW_MESH).toBe(onPreviewMesh)
      })

      it('omits ON_PREVIEW_MESH when no preview callback is given', async () => {
        mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
        const ifcAPI = makeDemandAPI(10)
        await parseIfcWithConway(new ArrayBuffer(4), ifcAPI)
        const [, settings] = ifcAPI.OpenModelStreamed.mock.calls[0]
        expect(settings.ON_PREVIEW_MESH).toBeUndefined()
      })

      it('opens a File via OpenModelStream and pumps ExtractGeometryBatchAsync', async () => {
        mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
        const ifcAPI = makeDemandAPI(10)
        ifcAPI.OpenModelStream = jest.fn(() => Promise.resolve(3))
        ifcAPI.ExtractGeometryBatchAsync = jest.fn((modelID, batchSize, cb) =>
          // eslint-disable-next-line new-cap
          ifcAPI.ExtractGeometryBatch(modelID, batchSize, cb))
        const file = new Blob([new Uint8Array([1, 2, 3, 4])])
        const result = await parseIfcWithConway(file, ifcAPI)
        expect(result.modelID).toBe(3)
        expect(ifcAPI.OpenModelStream).toHaveBeenCalledTimes(1)
        const [store, settings] = ifcAPI.OpenModelStream.mock.calls[0]
        expect(store.byteLength).toBe(4)
        expect(typeof store.read).toBe('function')
        expect(settings.DEFER_GEOMETRY).toBe(true)
        expect(ifcAPI.OpenModelStreamed).not.toHaveBeenCalled()
        expect(ifcAPI.ExtractGeometryBatchAsync).toHaveBeenCalled()
        expect(ifcAPI.ExtractGeometryBatchAsync.mock.calls[0][1]).toBe(8)
        expect(result.captured).toHaveLength(10)
      })

      it('falls back to OpenModelStreamed when OpenModelStream returns -1', async () => {
        mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
        const ifcAPI = makeDemandAPI(10)
        ifcAPI.OpenModelStream = jest.fn(() => Promise.resolve(-1))
        const file = new Blob([new Uint8Array([1, 2, 3, 4])])
        const result = await parseIfcWithConway(file, ifcAPI)
        expect(result.modelID).toBe(5)
        expect(ifcAPI.OpenModelStream).toHaveBeenCalledTimes(1)
        expect(ifcAPI.OpenModelStreamed).toHaveBeenCalledTimes(1)
        const [data] = ifcAPI.OpenModelStreamed.mock.calls[0]
        expect(data).toBeInstanceOf(Uint8Array)
        expect(result.captured).toHaveLength(10)
      })
    })

    // conway#638: the pumped FlatMesh stream is one of three pointer spines
    // over a 475 MB graph (conway holds `meshMap` and `vectorFlatMesh`; this
    // is Share's). Dropping it on the streaming path is only safe if the
    // counters that read the ARRAY keep working and the degraded end-of-load
    // readers can get the stream back — these pin both.
    describe('streaming-consumer retention (conway#638)', () => {
      beforeEach(() => mockIsFeatureEnabled.mockReset())
      afterAll(() => mockIsFeatureEnabled.mockReset())

      /**
       * @param {number} products total products the fake engine holds
       * @return {object} IfcAPI stub with the deferred pump surface
       */
      function makeDemandAPI(products) {
        let cursor = 0
        return {
          wasmModule: {},
          OpenModelStreamed: jest.fn(() => Promise.resolve(5)),
          OpenModelAsync: jest.fn(() => Promise.resolve(8)),
          OpenModel: jest.fn(() => 9),
          StreamAllMeshes: jest.fn(),
          ExtractGeometryBatch: jest.fn((modelID, batchSize, cb) => {
            const take = Math.min(batchSize, products - cursor)
            for (let i = 0; i < take; i++) {
              cb({expressID: 1000 + cursor + i, geometries: {size: () => 1}})
            }
            cursor += take
            return {extracted: take, remaining: products - cursor}
          }),
        }
      }

      /**
       * A windowed (store-backed) twin of the demand API: `OpenModelStream`
       * succeeds, which is the shape a GitHub/OPFS-backed load takes because
       * `Loader.js` hands `parse` the File itself rather than its bytes.
       *
       * @param {number} products total products the fake engine holds
       * @return {object} IfcAPI stub whose deferred open is windowed
       */
      function makeWindowedDemandAPI(products) {
        const ifcAPI = makeDemandAPI(products)
        ifcAPI.OpenModelStream = jest.fn(() => Promise.resolve(3))
        ifcAPI.ExtractGeometryBatchAsync = jest.fn((modelID, batchSize, cb) =>
          // eslint-disable-next-line new-cap
          Promise.resolve(ifcAPI.ExtractGeometryBatch(modelID, batchSize, cb)))
        return ifcAPI
      }

      it('declares STREAMING_CONSUMER on the deferred open', async () => {
        // Live on this pin (conway#657, 1.1578.666-g39d59784): this is what
        // stops conway retaining the other two spines. Jest mocks the
        // engine, so this test only asserts Share sends the setting — the
        // engine-side contract is verified against the real pin separately.
        mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
        const ifcAPI = makeDemandAPI(10)
        await parseIfcWithConway(new ArrayBuffer(4), ifcAPI)
        const [, settings] = ifcAPI.OpenModelStreamed.mock.calls[0]
        expect(settings.STREAMING_CONSUMER).toBe(true)
      })

      it('does not declare STREAMING_CONSUMER on the classic open', async () => {
        // A classic open has no pump and no accumulation to suppress, and
        // sending the flag there would claim an ownership contract that
        // nothing on this path honours.
        mockIsFeatureEnabled.mockImplementation(() => false)
        const ifcAPI = makeDemandAPI(10)
        await parseIfcWithConway(new ArrayBuffer(4), ifcAPI)
        const [, settings] = ifcAPI.OpenModelStreamed.mock.calls[0]
        expect(settings.STREAMING_CONSUMER).toBeUndefined()
      })

      it('counts every pumped mesh in the boundary log while retaining none', async () => {
        // The permanent `[conwayDirect] demand pump:` line (Share#1744) is
        // the only signal distinguishing a streaming load from a
        // blank-screen-then-pop one, and it used to report `captured.length`
        // — which is now 0. It has to report the meshes actually delivered.
        mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
        const ifcAPI = makeDemandAPI(150)
        const result = await parseIfcWithConway(
          new ArrayBuffer(4), ifcAPI, undefined, undefined, jest.fn())
        expect(result.captured).toHaveLength(0)
        const pumpLine = infoSpy.mock.calls
          .map(([line]) => line)
          .find((line) => typeof line === 'string' && line.includes('demand pump:'))
        expect(pumpLine).toContain('meshes=150')
        expect(pumpLine).toContain('batches=3')
        expect(pumpLine).toContain('retained=no')
      })

      it('retains the stream when nothing else takes delivery', async () => {
        // No `onMeshBatch` means `captured` IS the delivery, not a copy of
        // it — dropping here would hand the caller an empty model.
        mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
        const ifcAPI = makeDemandAPI(150)
        const result = await parseIfcWithConway(new ArrayBuffer(4), ifcAPI)
        expect(result.captured).toHaveLength(150)
        expect(await result.recapture()).toHaveLength(150)
        // Retained means whole: no re-extraction is needed or performed.
        expect(ifcAPI.StreamAllMeshes).not.toHaveBeenCalled()
        const pumpLine = infoSpy.mock.calls
          .map(([line]) => line)
          .find((line) => typeof line === 'string' && line.includes('demand pump:'))
        expect(pumpLine).toContain('retained=yes')
      })

      it('retains the stream on a WINDOWED open with no async ask, where re-extraction throws', async () => {
        // The OLD-PIN regime, and the one the shipped pin
        // (1.1578.666-g39d59784) is in: no `StreamAllMeshesAsync` on the
        // stub, exactly as on that engine. Verified against it
        // (compiled/src/compat/web-ifc/ifc_api_proxy_ifc.js:1527):
        // `streamAllMeshes` on a deferred model drains through the
        // SYNCHRONOUS `ExtractGeometryBatch`, which refuses a windowed
        // source outright. conway#657 does not change that — its re-walk
        // (`recaptureWholeModel_`) hangs off the same drain — so there is
        // nothing to re-extract with here and the contents must be kept.
        // conway#660 is what removes this case's premise, for pins that
        // carry it; the nested describe below is that regime.
        mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
        const ifcAPI = makeWindowedDemandAPI(20)
        ifcAPI.StreamAllMeshes = jest.fn(() => {
          throw new Error(
            'ExtractGeometryBatch is synchronous and cannot page a windowed source')
        })
        const file = new Blob([new Uint8Array([1, 2, 3, 4])])
        const result = await parseIfcWithConway(
          file, ifcAPI, undefined, undefined, jest.fn())
        expect(ifcAPI.OpenModelStream).toHaveBeenCalledTimes(1)
        expect(result.captured).toHaveLength(20)
        // The degraded reader is served without ever touching the entry
        // point that would throw.
        expect(await result.recapture()).toHaveLength(20)
        expect(ifcAPI.StreamAllMeshes).not.toHaveBeenCalled()
        // Counter fidelity is not a streaming-path-only concern: the log
        // must report real meshes on the retained branch too, where
        // `captured.length` would happen to agree and so hide a regression
        // in the counter itself.
        const pumpLine = infoSpy.mock.calls
          .map(([line]) => line)
          .find((line) => typeof line === 'string' && line.includes('demand pump:'))
        expect(pumpLine).toContain('meshes=20')
        expect(pumpLine).toContain('retained=yes')
        // The regime is reported, so a production trace says which side of
        // the pin bump it measured without anyone reading a version string.
        expect(pumpLine).toContain('windowed=yes')
        expect(pumpLine).toContain('asyncAsk=no')
      })

      it('surfaces the engine refusal when a DEFERRED windowed model pumps nothing', async () => {
        // Pins CURRENT behaviour, which is a pre-existing defect this
        // change neither introduces nor fixes.
        //
        // `pumpedMeshes === 0` does not imply conway fell back to a classic
        // open: a genuinely deferred model with nothing to extract (a
        // properties-only IFC, or one whose every product failed geometry)
        // exits the pump loop the same way, because it breaks on
        // `remaining === 0 && extracted === 0` whatever the reason. The
        // sentinel's one-shot `StreamAllMeshes` then takes conway's
        // DEFERRED branch, which drains through the synchronous
        // `ExtractGeometryBatch` and refuses a windowed source.
        //
        // The sentinel it replaced (`captured.length === 0`) selected the
        // same models and called the same method, so this is byte-equivalent
        // to main. Pinned red-to-green for whoever fixes it engine-side.
        mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
        const ifcAPI = makeWindowedDemandAPI(0)
        ifcAPI.StreamAllMeshes = jest.fn(() => {
          throw new Error(
            'ExtractGeometryBatch is synchronous and cannot page a windowed source')
        })
        const file = new Blob([new Uint8Array([1, 2, 3, 4])])
        await expect(parseIfcWithConway(file, ifcAPI, undefined, undefined, jest.fn()))
          .rejects.toThrow(/cannot page a windowed source/)
        // It really did reach the sentinel rather than failing earlier.
        expect(ifcAPI.StreamAllMeshes).toHaveBeenCalledTimes(1)
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('demand pump produced no batches'))
      })

      it('drops the stream when a windowed open falls back to a buffered one', async () => {
        // conway#510: an `OpenModelStream` that returns -1 (STEP, failed
        // sniff) re-opens buffered. The model is then resident, so
        // re-extraction works again and the retention must lift with it —
        // otherwise the fallback silently keeps 475 MB alive.
        mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
        const ifcAPI = makeWindowedDemandAPI(20)
        ifcAPI.OpenModelStream = jest.fn(() => Promise.resolve(-1))
        const file = new Blob([new Uint8Array([1, 2, 3, 4])])
        const result = await parseIfcWithConway(
          file, ifcAPI, undefined, undefined, jest.fn())
        expect(ifcAPI.OpenModelStreamed).toHaveBeenCalledTimes(1)
        expect(result.captured).toHaveLength(0)
      })

      it('re-extracts on demand for a degraded end-of-load build', async () => {
        // The replacement for retention: the whole stream comes back at the
        // moment of failure instead of being held for a fallback that
        // almost never runs.
        mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
        const ifcAPI = makeDemandAPI(150)
        ifcAPI.StreamAllMeshes = jest.fn((modelID, cb) => {
          for (let i = 0; i < 150; i++) {
            cb({expressID: 1000 + i, geometries: {size: () => 1}})
          }
        })
        const result = await parseIfcWithConway(
          new ArrayBuffer(4), ifcAPI, undefined, undefined, jest.fn())
        // Not paid unless a degraded reader actually asks.
        expect(ifcAPI.StreamAllMeshes).not.toHaveBeenCalled()
        const recaptured = await result.recapture()
        expect(recaptured).toHaveLength(150)
        expect(recaptured[0].expressID).toBe(1000)
        expect(ifcAPI.StreamAllMeshes).toHaveBeenCalledTimes(1)
        expect(ifcAPI.StreamAllMeshes.mock.calls[0][0]).toBe(5)
      })

      it('re-extracts at most once across the two consecutive degraded builds', async () => {
        // `buildBatchedConwayModel` then `buildConwayIfcModel` both ask. A
        // second `StreamAllMeshes` on a live model re-pushes into conway's
        // still-populated cache and doubles every triangle count — the
        // defect IfcItemsMap.js documents from the consumer side — so the
        // accessor has to memoise.
        mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
        const ifcAPI = makeDemandAPI(10)
        ifcAPI.StreamAllMeshes = jest.fn((modelID, cb) => {
          cb({expressID: 7, geometries: {size: () => 1}})
        })
        const result = await parseIfcWithConway(
          new ArrayBuffer(4), ifcAPI, undefined, undefined, jest.fn())
        const first = await result.recapture()
        const second = await result.recapture()
        expect(second).toBe(first)
        expect(ifcAPI.StreamAllMeshes).toHaveBeenCalledTimes(1)
      })

      it('serves the empty-pump sentinel off the counter, not the array', async () => {
        // The sentinel used to be `captured.length === 0`, which on the
        // streaming path is now ALSO true after a perfectly healthy pump.
        // Reading the counter instead is what keeps a 150-mesh streaming
        // load from being mistaken for a no-op pump and re-extracted whole.
        mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
        const ifcAPI = makeDemandAPI(150)
        await parseIfcWithConway(
          new ArrayBuffer(4), ifcAPI, undefined, undefined, jest.fn())
        expect(ifcAPI.StreamAllMeshes).not.toHaveBeenCalled()
        expect(warnSpy).not.toHaveBeenCalledWith(
          expect.stringContaining('demand pump produced no batches'))
      })

      it('still recovers a genuinely empty pump, with an onMeshBatch present', async () => {
        // The blank-screen case the sentinel exists for: conway fell back
        // internally to a classic non-deferred open, so the pump is a no-op
        // and `StreamAllMeshes` — a classic walk over live natives, which
        // works even on a windowed source — is the only delivery. This must
        // keep filling `captured` regardless of the retention decision.
        mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
        const ifcAPI = makeDemandAPI(10)
        ifcAPI.ExtractGeometryBatch = jest.fn(() => ({extracted: 0, remaining: 0}))
        ifcAPI.StreamAllMeshes = jest.fn((modelID, cb) => {
          for (let i = 0; i < 5; i++) {
            cb({expressID: 2000 + i, geometries: {size: () => 1}})
          }
        })
        const onMeshBatch = jest.fn()
        const result = await parseIfcWithConway(
          new ArrayBuffer(4), ifcAPI, undefined, undefined, onMeshBatch)
        expect(result.captured).toHaveLength(5)
        expect(await result.recapture()).toHaveLength(5)
        expect(onMeshBatch).not.toHaveBeenCalled()
        // One walk, not two: `recapture` must not re-drive the engine on a
        // path where `captured` is already whole.
        expect(ifcAPI.StreamAllMeshes).toHaveBeenCalledTimes(1)
        const pumpLine = infoSpy.mock.calls
          .map(([line]) => line)
          .find((line) => typeof line === 'string' && line.includes('demand pump:'))
        expect(pumpLine).toContain('meshes=0')
      })

      // conway#660 / conway#672: `StreamAllMeshesAsync` is the async twin of
      // the whole-model ask, and the ONLY entry point a windowed deferred
      // model can answer. The pin this landed on
      // (1.1578.666-g39d59784) does NOT export it — verified by grep over
      // `node_modules/@bldrs-ai/conway` — so everything in this block is
      // DORMANT until the next routine pin bump, and the tests above pin
      // that today's behaviour is unchanged. These are what the bump
      // activates.
      describe('windowed retention with the async whole-model ask (conway#660)', () => {
        /**
         * Add conway#660's async ask to a stub, serving a fixed answer.
         * Async-shaped on purpose: the real one drains the pump and yields,
         * so a call site that forgot to await gets a Promise here too.
         *
         * @param {object} ifcAPI stub to extend
         * @param {number} served meshes the whole-model ask answers with
         * @return {object} the same stub, with the async ask attached
         */
        function withAsyncWholeModelAsk(ifcAPI, served) {
          ifcAPI.StreamAllMeshesAsync = jest.fn(async (modelID, cb) => {
            await Promise.resolve()
            for (let i = 0; i < served; i++) {
              cb({expressID: 3000 + i, geometries: {size: () => 1}})
            }
          })
          return ifcAPI
        }

        /**
         * The sync entry point as the real engine behaves on a windowed
         * deferred model: it refuses rather than serving.
         *
         * @param {object} ifcAPI stub to extend
         * @return {object} the same stub
         */
        function withWindowedSyncRefusal(ifcAPI) {
          ifcAPI.StreamAllMeshes = jest.fn(() => {
            throw new Error(
              'ExtractGeometryBatch is synchronous and cannot page a windowed source')
          })
          return ifcAPI
        }

        /**
         * @param {object} spy the console.info spy
         * @return {string|undefined} the demand-pump boundary line
         */
        function pumpLineFrom(spy) {
          return spy.mock.calls
            .map(([line]) => line)
            .find((line) => typeof line === 'string' && line.includes('demand pump:'))
        }

        /** @return {Blob} a File-shaped source, which takes the windowed open */
        function windowedFile() {
          return new Blob([new Uint8Array([1, 2, 3, 4])])
        }

        it('drops the stream on a WINDOWED open once the engine can serve it back', async () => {
          // The whole point of conway#660: GitHub/OPFS loads take the
          // windowed open by default, so this branch is where the third
          // pointer spine was still being held over the 475 MB graph. With
          // an ask that can answer, it goes the way the buffered one already
          // did.
          mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
          const ifcAPI = withAsyncWholeModelAsk(
            withWindowedSyncRefusal(makeWindowedDemandAPI(20)), 20)
          const result = await parseIfcWithConway(
            windowedFile(), ifcAPI, undefined, undefined, jest.fn())
          expect(ifcAPI.OpenModelStream).toHaveBeenCalledTimes(1)
          expect(result.captured).toHaveLength(0)
          const pumpLine = pumpLineFrom(infoSpy)
          expect(pumpLine).toContain('meshes=20')
          expect(pumpLine).toContain('windowed=yes')
          expect(pumpLine).toContain('asyncAsk=yes')
          expect(pumpLine).toContain('retained=no')
          // Still not paid unless a degraded reader actually asks — the ask
          // is a full drain plus a full scene walk.
          expect(ifcAPI.StreamAllMeshesAsync).not.toHaveBeenCalled()
        })

        it('serves a degraded build through the async ask, never the sync refusal', async () => {
          // The replacement for retention, on the source type that could not
          // have one before. The sync entry point is left in place throwing
          // the real engine's message, so routing to it would fail loudly
          // rather than pass by accident.
          mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
          const ifcAPI = withAsyncWholeModelAsk(
            withWindowedSyncRefusal(makeWindowedDemandAPI(20)), 20)
          const result = await parseIfcWithConway(
            windowedFile(), ifcAPI, undefined, undefined, jest.fn())
          const recaptured = await result.recapture()
          expect(recaptured).toHaveLength(20)
          expect(recaptured[0].expressID).toBe(3000)
          expect(ifcAPI.StreamAllMeshesAsync).toHaveBeenCalledTimes(1)
          // Bound to the windowed model's handle, not the buffered
          // fallback's (3 vs 5) — a mis-bound ask would serve another model.
          expect(ifcAPI.StreamAllMeshesAsync.mock.calls[0][0]).toBe(3)
          expect(ifcAPI.StreamAllMeshes).not.toHaveBeenCalled()
        })

        it('memoises the async ask across the two consecutive degraded builds', async () => {
          // Same defect as the sync path's memo: a second whole-model ask on
          // a live model doubles every triangle count (IfcItemsMap.js §"Why
          // this is a separate entry point"). The overlap case is the one
          // only the async path can reach — `buildBatchedConwayModel`'s
          // failure and `buildConwayIfcModel`'s ask are consecutive awaits,
          // but nothing in the seam forces them to be, so the memo holds the
          // PROMISE rather than the resolved array.
          mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
          const ifcAPI = withAsyncWholeModelAsk(
            withWindowedSyncRefusal(makeWindowedDemandAPI(20)), 20)
          const result = await parseIfcWithConway(
            windowedFile(), ifcAPI, undefined, undefined, jest.fn())
          const [first, second] = await Promise.all(
            [result.recapture(), result.recapture()])
          expect(second).toBe(first)
          const third = await result.recapture()
          expect(third).toBe(first)
          expect(ifcAPI.StreamAllMeshesAsync).toHaveBeenCalledTimes(1)
        })

        it('keeps the SYNC ask on a buffered open even when the async one exists', async () => {
          // Byte-identity for the path that already worked: the async ask is
          // wired only where the sync one cannot serve. A pin bump must not
          // silently re-route a buffered load onto a second implementation
          // of the same answer.
          mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
          const ifcAPI = withAsyncWholeModelAsk(makeDemandAPI(10), 10)
          ifcAPI.StreamAllMeshes = jest.fn((modelID, cb) => {
            cb({expressID: 7, geometries: {size: () => 1}})
          })
          const result = await parseIfcWithConway(
            new ArrayBuffer(4), ifcAPI, undefined, undefined, jest.fn())
          const pumpLine = pumpLineFrom(infoSpy)
          expect(pumpLine).toContain('windowed=no')
          expect(pumpLine).toContain('retained=no')
          // The token is the ENGINE's capability, not the entry point this
          // load drives: `yes` here beside a sync `StreamAllMeshes` below is
          // the intended reading, and the `recaptured … via …` line is what
          // names the ask that actually ran.
          expect(pumpLine).toContain('asyncAsk=yes')
          expect(await result.recapture()).toHaveLength(1)
          expect(ifcAPI.StreamAllMeshes).toHaveBeenCalledTimes(1)
          expect(ifcAPI.StreamAllMeshesAsync).not.toHaveBeenCalled()
        })

        it('still retains a windowed stream when nothing else takes delivery', async () => {
          // The retention case that is not about the engine at all: with no
          // `onMeshBatch`, `captured` IS the delivery. An ask that can now
          // serve must not be read as permission to hand back an empty
          // model.
          mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
          const ifcAPI = withAsyncWholeModelAsk(
            withWindowedSyncRefusal(makeWindowedDemandAPI(20)), 20)
          const result = await parseIfcWithConway(windowedFile(), ifcAPI)
          expect(result.captured).toHaveLength(20)
          expect(await result.recapture()).toBe(result.captured)
          expect(pumpLineFrom(infoSpy)).toContain('retained=yes')
          expect(ifcAPI.StreamAllMeshesAsync).not.toHaveBeenCalled()
        })

        it('recovers an empty pump on a DEFERRED windowed model through the async ask', async () => {
          // The deliberate behaviour CHANGE this brings, and the Share-side
          // symptom of conway#661: a genuinely deferred windowed model with
          // nothing to extract (properties-only IFC, or every product failed
          // geometry) exits the pump loop like an internal classic fallback
          // does, and the sentinel's one-shot sync `StreamAllMeshes` then
          // takes conway's deferred branch and throws the load away. #1800
          // pinned that as a pre-existing defect; on a pin with the async
          // ask the same sentinel can serve instead, so it does — one
          // feature-detected branch, no new machinery. The twin test above
          // pins that the throw is unchanged on a pin without it.
          mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
          const ifcAPI = withAsyncWholeModelAsk(
            withWindowedSyncRefusal(makeWindowedDemandAPI(0)), 5)
          const result = await parseIfcWithConway(
            windowedFile(), ifcAPI, undefined, undefined, jest.fn())
          expect(result.captured).toHaveLength(5)
          // Unconditionally retained here whatever the retention decision
          // said: this branch means the streaming delivery produced nothing,
          // so `captured` is once again the only delivery.
          expect(await result.recapture()).toBe(result.captured)
          expect(ifcAPI.StreamAllMeshesAsync).toHaveBeenCalledTimes(1)
          expect(ifcAPI.StreamAllMeshes).not.toHaveBeenCalled()
          // The blank-screen warning still fires: nothing streamed, so the
          // user still waited for the end-of-load build.
          expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('demand pump produced no batches'))
        })

        it('serves the budget subset the ask answers with, without inventing a throw', async () => {
          // conway#672's measured semantics: under a budget the re-walk
          // resolves against the geometry STORE, so evicted placements are
          // reported missing rather than paged back — the ask serves a
          // strict SUBSET (measured there as 3 of 16 under a 2 KiB budget,
          // warning "13 placed instance(s) could not be resolved"). Share
          // takes what it gets; a subset still builds a model, and treating
          // it as failure would turn a degraded build into a dead load.
          mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
          const ifcAPI = withAsyncWholeModelAsk(
            withWindowedSyncRefusal(makeWindowedDemandAPI(20)), 12)
          const result = await parseIfcWithConway(
            windowedFile(), ifcAPI, undefined, undefined, jest.fn())
          const recaptured = await result.recapture()
          expect(recaptured).toHaveLength(12)
          expect(pumpLineFrom(infoSpy)).toContain('meshes=20')
        })

        it('lets a total-loss throw from the ask reach the load, once', async () => {
          // Total loss throws rather than serving an empty model
          // (conway#672). The accessor must not swallow it — an empty scene
          // reported as a successful load is the failure mode that costs a
          // user their file — and the memo must not re-drive a full drain to
          // fail a second time for the second degraded build.
          mockIsFeatureEnabled.mockImplementation((name) => name === 'demandGeometry')
          const ifcAPI = withWindowedSyncRefusal(makeWindowedDemandAPI(20))
          ifcAPI.StreamAllMeshesAsync = jest.fn(() => Promise.reject(new Error(
            'StreamAllMeshesAsync: this model was opened with STREAMING_CONSUMER, ' +
            'so conway kept no reference to the meshes the pump delivered')))
          const result = await parseIfcWithConway(
            windowedFile(), ifcAPI, undefined, undefined, jest.fn())
          await expect(result.recapture()).rejects.toThrow(/STREAMING_CONSUMER/)
          await expect(result.recapture()).rejects.toThrow(/STREAMING_CONSUMER/)
          expect(ifcAPI.StreamAllMeshesAsync).toHaveBeenCalledTimes(1)
        })
      })

      it('recapture is the identity on the classic non-deferred path', async () => {
        mockIsFeatureEnabled.mockImplementation(() => false)
        const ifcAPI = makeDemandAPI(10)
        ifcAPI.StreamAllMeshes = jest.fn((modelID, cb) => {
          cb({expressID: 11, geometries: {size: () => 1}})
        })
        const result = await parseIfcWithConway(new ArrayBuffer(4), ifcAPI)
        expect(await result.recapture()).toBe(result.captured)
        expect(ifcAPI.StreamAllMeshes).toHaveBeenCalledTimes(1)
      })
    })

    describe('open-path selection (disableStreamOpen flag)', () => {
      // Share's jest config doesn't clearMocks, so a per-test
      // implementation would otherwise leak into later tests — reset to
      // the default (everything off) around this block.
      beforeEach(() => mockIsFeatureEnabled.mockReset())
      afterAll(() => mockIsFeatureEnabled.mockReset())

      /** @return {object} IfcAPI stub exposing all three open entries */
      function makeTriplePathAPI() {
        return {
          wasmModule: {},
          OpenModelStreamed: jest.fn(() => Promise.resolve(7)),
          OpenModelAsync: jest.fn(() => Promise.resolve(8)),
          OpenModel: jest.fn(() => 9),
          StreamAllMeshes: jest.fn(),
        }
      }

      it('disableStreamOpen exists and defaults to off in FeatureFlags', () => {
        // The mock above hides the real module from the loader; this
        // pins the shipped default (streaming ON) so a prod kill-switch
        // flip is a deliberate diff here too. The flag is inverted
        // because `?feature=` can only turn flags on — the runtime
        // escape hatch for a default-on behavior must be an off-flag.
        const {flags} = jest.requireActual('../../FeatureFlags')
        const flag = flags.find((f) => f.name === 'disableStreamOpen')
        expect(flag).toBeDefined()
        expect(flag.isActive).toBe(false)
      })

      it('prefers OpenModelStreamed by default (no flags set)', async () => {
        mockIsFeatureEnabled.mockImplementation(() => false)
        const ifcAPI = makeTriplePathAPI()
        const result = await parseIfcWithConway(new ArrayBuffer(4), ifcAPI)
        expect(result.modelID).toBe(7)
        expect(ifcAPI.OpenModelStreamed).toHaveBeenCalledTimes(1)
        const [data, settings] = ifcAPI.OpenModelStreamed.mock.calls[0]
        expect(data).toBeInstanceOf(Uint8Array)
        expect(settings).toEqual({COORDINATE_TO_ORIGIN: true, USE_FAST_BOOLS: true})
        expect(ifcAPI.OpenModelAsync).not.toHaveBeenCalled()
        expect(ifcAPI.OpenModel).not.toHaveBeenCalled()
      })

      it('falls back to OpenModelAsync when the engine predates OpenModelStreamed', async () => {
        mockIsFeatureEnabled.mockImplementation(() => false)
        const ifcAPI = makeTriplePathAPI()
        delete ifcAPI.OpenModelStreamed
        const result = await parseIfcWithConway(new ArrayBuffer(4), ifcAPI)
        expect(result.modelID).toBe(8)
        expect(ifcAPI.OpenModelAsync).toHaveBeenCalledTimes(1)
        expect(ifcAPI.OpenModel).not.toHaveBeenCalled()
      })

      it('disableStreamOpen reverts to OpenModelAsync, even with OpenModelStreamed present', async () => {
        mockIsFeatureEnabled.mockImplementation((name) => name === 'disableStreamOpen')
        const ifcAPI = makeTriplePathAPI()
        const result = await parseIfcWithConway(new ArrayBuffer(4), ifcAPI)
        expect(result.modelID).toBe(8)
        expect(ifcAPI.OpenModelStreamed).not.toHaveBeenCalled()
        expect(ifcAPI.OpenModelAsync).toHaveBeenCalledTimes(1)
      })

      it('throws when OpenModelStreamed reports failure (-1)', async () => {
        mockIsFeatureEnabled.mockImplementation(() => false)
        const ifcAPI = makeTriplePathAPI()
        ifcAPI.OpenModelStreamed = jest.fn(() => Promise.resolve(-1))
        await expect(parseIfcWithConway(new ArrayBuffer(4), ifcAPI)).rejects.toThrow(
          /OpenModel returned -1/)
        expect(ifcAPI.StreamAllMeshes).not.toHaveBeenCalled()
      })
    })
  })

  describe('decorateConwayDirectIfcModel — property-method closures', () => {
    /** @return {object} minimal Conway IfcAPI stub */
    function makeIfcAPI() {
      return {
        properties: {
          getItemProperties: jest.fn(),
          getPropertySets: jest.fn(),
          getSpatialStructure: jest.fn(),
          getIfcType: jest.fn(),
        },
      }
    }

    it('attaches getItemProperties bound to the model\'s modelID', async () => {
      const ifcAPI = makeIfcAPI()
      ifcAPI.properties.getItemProperties.mockResolvedValue({expressID: 42, Name: {value: 'Wall'}})
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 7)
      const props = await ifcModel.getItemProperties(42)
      expect(props.Name.value).toBe('Wall')
      // The model's bound modelID (7) flows through — consumers don't
      // pass it.
      expect(ifcAPI.properties.getItemProperties).toHaveBeenCalledWith(7, 42, false)
    })

    it('forwards recursive arg to getItemProperties', async () => {
      const ifcAPI = makeIfcAPI()
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 0)
      await ifcModel.getItemProperties(42, true)
      expect(ifcAPI.properties.getItemProperties).toHaveBeenCalledWith(0, 42, true)
    })

    it('attaches getPropertySets bound to the model\'s modelID', async () => {
      const ifcAPI = makeIfcAPI()
      ifcAPI.properties.getPropertySets.mockResolvedValue([{Name: 'Pset_WallCommon'}])
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 3)
      const psets = await ifcModel.getPropertySets(42)
      expect(psets).toHaveLength(1)
      expect(ifcAPI.properties.getPropertySets).toHaveBeenCalledWith(3, 42, false)
    })

    it('getSpatialStructure accepts (modelID, withProperties) — the manager-shape call site', async () => {
      const ifcAPI = makeIfcAPI()
      ifcAPI.properties.getSpatialStructure.mockResolvedValue({expressID: 100, children: []})
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 0)
      // Two-arg call (CadView.jsx / IfcIsolator.js shape). The
      // leading arg is ignored — the bound modelID is used instead.
      await ifcModel.getSpatialStructure(0, true)
      expect(ifcAPI.properties.getSpatialStructure)
        .toHaveBeenCalledWith(0, true, {includeSolids: true})
    })

    it('getSpatialStructure accepts a single boolean arg — the cache-hit closure shape', async () => {
      const ifcAPI = makeIfcAPI()
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 0)
      await ifcModel.getSpatialStructure(true)
      expect(ifcAPI.properties.getSpatialStructure)
        .toHaveBeenCalledWith(0, true, {includeSolids: true})
    })

    it('getSpatialStructure passes Conway\'s \'names\' mode through un-coerced', async () => {
      // Regression pin: 'names' must reach Conway as the string, not be
      // boolean-coerced — a truthy coercion would silently upgrade the
      // light Name/LongName/GlobalId walk back to the full-record visit
      // that 'names' mode exists to avoid (CadView.jsx load path).
      const ifcAPI = makeIfcAPI()
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 7)
      // Two-arg manager shape (CadView.jsx): (modelID, 'names').
      await ifcModel.getSpatialStructure(0, 'names')
      expect(ifcAPI.properties.getSpatialStructure)
        .toHaveBeenCalledWith(7, 'names', {includeSolids: true})
      // Single-arg cache-hit closure shape: ('names').
      await ifcModel.getSpatialStructure('names')
      expect(ifcAPI.properties.getSpatialStructure)
        .toHaveBeenLastCalledWith(7, 'names', {includeSolids: true})
    })

    it('getIfcType is an identity over the spatial-tree node\'s string type', () => {
      // Regression pin: SearchIndex (`src/search/SearchIndex.js#indexElement`)
      // calls `Ifc.getType(model, elt)` → `model.properties.getIfcType(elt.type)`
      // where `model = {properties: m}` and `elt` is a spatial-tree node.
      // Conway's `properties.getSpatialStructure` returns nodes with `.type`
      // already set to the IFC string (e.g. 'IFCWALL'), so the model-level
      // `getIfcType` is the identity — matches Loader.js#convertToShareModel's
      // cache-hit closure shape. An async / Promise-returning impl here would
      // crash SearchIndex's `key.toLowerCase()`.
      const ifcAPI = makeIfcAPI()
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 0)
      expect(ifcModel.getIfcType('IFCWALL')).toBe('IFCWALL')
      expect(ifcModel.getIfcType('IFCBUILDINGSTOREY')).toBe('IFCBUILDINGSTOREY')
    })

    it('sets capabilities flips: ifcSubsets false, instancePicking + expressIdPicking true', () => {
      const ifcAPI = makeIfcAPI()
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 0)
      expect(ifcModel.capabilities.ifcSubsets).toBe(false)
      expect(ifcModel.capabilities.instancePicking).toBe(true)
      expect(ifcModel.capabilities.expressIdPicking).toBe(true)
    })

    it('binds modelID on the model', () => {
      const ifcAPI = makeIfcAPI()
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 17)
      expect(ifcModel.modelID).toBe(17)
    })

    it('attaches an ifcManager shim — passes the !m.ifcManager IFC-discriminator check', () => {
      // Regression pin: `CadView.jsx#onModel` early-returns when
      // `!m.ifcManager`. Without this shim, the Conway-direct mesh
      // would be treated as a non-IFC model and `setRootElement`
      // would never fire — NavTree stays empty + selection effects
      // skip.
      const ifcAPI = makeIfcAPI()
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 0)
      expect(ifcModel.ifcManager).toBeTruthy()
      expect(ifcModel.ifcManager.ifcAPI).toBe(ifcAPI)
    })

    it('ifcManager shim routes getSpatialStructure to Conway with the bound modelID', async () => {
      const ifcAPI = makeIfcAPI()
      ifcAPI.properties.getSpatialStructure.mockResolvedValue({expressID: 100})
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 5)
      // IfcIsolator.js shape: `model.ifcManager.getSpatialStructure(0, false)`.
      // The leading arg is ignored; the bound modelID (5) flows through.
      await ifcModel.ifcManager.getSpatialStructure(0, false)
      expect(ifcAPI.properties.getSpatialStructure).toHaveBeenCalledWith(5, false)
    })

    it('ifcManager shim routes getItemProperties + getPropertySets to Conway', async () => {
      const ifcAPI = makeIfcAPI()
      ifcAPI.properties.getItemProperties.mockResolvedValue({Name: {value: 'X'}})
      ifcAPI.properties.getPropertySets.mockResolvedValue([])
      const ifcModel = new Mesh()
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, 3)
      await ifcModel.ifcManager.getItemProperties(0, 42, false)
      expect(ifcAPI.properties.getItemProperties).toHaveBeenCalledWith(3, 42, false)
      await ifcModel.ifcManager.getPropertySets(0, 42, false)
      expect(ifcAPI.properties.getPropertySets).toHaveBeenCalledWith(3, 42, false)
    })
  })
})
