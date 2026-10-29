import {CompressionStream as NodeCompressionStream} from 'node:stream/web'
import {act, renderHook, waitFor} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedIn} from '../__mocks__/authentication'
import {readModelByPathFromOPFS} from '../OPFS/utils'
import {gtagEventWithCid, trackModelAction} from '../privacy/analytics'
import useStore from '../store/useStore'
import {compressedExport, gzippedExport} from './artifactSizes'
import {triggerDownload} from './download'
import {recordExport} from './exportHistory'
import {ProModuleDeniedError, forgetProModule, loadProModule} from './proModuleLoader'
import {NO_FREE_SLOT_REASON} from './exportSlots'
import useExport, {bytesBucket, exportFailureReason, formatBytes, noFreeSlotMessage} from './useExport'
import {handleRoute} from '../routes/routes'
import {modelSlotKey} from '../quota/modelSlotKey'
import {webcrypto} from 'node:crypto'


jest.mock('../OPFS/utils', () => ({readModelByPathFromOPFS: jest.fn()}))
// The per-(artifact, codec) cache has its own suite (artifactSizes.test.js);
// here it stands in for "the panel already compressed this", which is the
// state the hook is written against.
jest.mock('./artifactSizes', () => ({compressedExport: jest.fn(), gzippedExport: jest.fn()}))
// gtagEventWithCid is the one that carries open_cid (Share#1964); its own
// test is in privacy/analytics.test.js. GATE_EVENTS stays real so the names
// asserted here are the names that ship.
// trackModelAction is mocked the same way (its tests are there too);
// modelRouteSource, modelContentId and the MODEL_* vocabularies stay real.
jest.mock('../privacy/analytics', () => {
  const actual = jest.requireActual('../privacy/analytics')
  return {
    gtagEvent: jest.fn(),
    gtagEventWithCid: jest.fn(),
    trackModelAction: jest.fn(),
    GATE_EVENTS: actual.GATE_EVENTS,
    MODEL_ACTIONS: actual.MODEL_ACTIONS,
    MODEL_GATES: actual.MODEL_GATES,
    modelContentId: actual.modelContentId,
    modelRouteSource: actual.modelRouteSource,
  }
})
jest.mock('./download', () => ({triggerDownload: jest.fn()}))
// The history lib has its own suite (exportHistory.test.js); here it stands
// in for "the export was recorded", and mocking it keeps this suite off OPFS
// and off the network.
jest.mock('./exportHistory', () => ({recordExport: jest.fn()}))
// The loader itself is covered by proModuleLoader.test.js; here it stands in
// for "the server said yes / the server said no". The error CLASS stays real
// so the hook's `instanceof` branch is the one under test.
jest.mock('./proModuleLoader', () => ({
  ...jest.requireActual('./proModuleLoader'),
  loadProModule: jest.fn(),
  forgetProModule: jest.fn(),
}))


/* eslint-disable no-magic-numbers */
const CACHE_KEY_ARGS = {
  ns1: 'gh-bldrs-ai',
  ns2: 'test-models',
  ns3: 'main',
  sourcePath: 'ifc/misc/box.ifc',
  sourceHash: 'sha123',
}
const SCHEMA_VER = '0.21.0-batched'
// Two models' routes, as handleRoute gives them: what real_model_open sends
// as their content_id is the download URL (analytics#modelContentId).
const GITHUB_ROUTE = {
  kind: 'provider',
  provider: 'github',
  downloadUrl: new URL('https://raw.githubusercontent.com/acme/private/main/box.ifc'),
}
const GITHUB_CONTENT_ID = 'https://raw.githubusercontent.com/acme/private/main/box.ifc'
const LOCAL_ROUTE = {
  kind: 'file',
  isUploadedFile: true,
  filepath: '/u.ifc',
  downloadUrl: new URL('https://bldrs.ai/u.ifc'),
}
const LOCAL_CONTENT_ID = 'https://bldrs.ai/u.ifc'
const KIND_LABEL = 'github'
const ARTIFACT_BYTES = new Uint8Array([1, 2, 3, 4])
const EXPORTED = {
  blob: new Blob([new Uint8Array(2048)], {type: 'model/gltf-binary'}),
  filename: 'box.glb',
  stats: {inputBytes: 4096, outputBytes: 2048, strippedExtensions: []},
}


/**
 * An unsigned JWT carrying the `app_metadata` claim, the way Auth0's Action
 * stamps it. Nothing here verifies a signature; `jwtDecode` only reads the
 * payload.
 *
 * @param {object} appMetadata the claim's value
 * @return {string} header.payload.signature
 */
function jwtWithAppMetadata(appMetadata) {
  const base64url = (obj) => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${base64url({alg: 'RS256', typ: 'JWT'})}.` +
    `${base64url({'https://bldrs.ai/app_metadata': appMetadata})}.signature`
}


describe('useExport', () => {
  let exportArtifact
  let getAccessTokenSilently

  beforeEach(() => {
    jest.clearAllMocks()
    // Auth settled, as after BaseRoutes' token pass: model_export waits for
    // it (privacy/modelActionTracking.js). The restore-race case unsets it.
    useStore.setState({modelPath: null, isAuthResolved: true, authResolvedFor: true})
    getAccessTokenSilently = jest.fn().mockResolvedValue('test-token')
    mockedUseAuth0.mockReturnValue({...mockedUserLoggedIn, getAccessTokenSilently})
    recordExport.mockResolvedValue({recorded: true, status: 200, exports: []})
    exportArtifact = jest.fn().mockReturnValue(EXPORTED)
    loadProModule.mockResolvedValue({namespace: {exportArtifact}, slots: null})
    readModelByPathFromOPFS.mockResolvedValue({
      arrayBuffer: () => Promise.resolve(ARTIFACT_BYTES.buffer),
    })
    useStore.getState().setGlbArtifact(
      {cacheKeyArgs: CACHE_KEY_ARGS, schemaVer: SCHEMA_VER, writtenAt: 1, kindLabel: KIND_LABEL})
    useStore.getState().setAppMetadata(null)
    useStore.getState().setSnackMessage(null)
    useStore.getState().setIsExportInFlight(false)
    useStore.getState().setModelSlots(null)
    useStore.getState().setModelPath(null)
    useStore.getState().setAppPrefix(null)
  })

  afterAll(() => {
    useStore.getState().setGlbArtifact(null)
  })

  it('reads the artifact at the published key, exports it and downloads the result', async () => {
    useStore.setState({modelPath: {kind: 'provider', provider: 'github'}})
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {stripBldrsMetadata: false})
    })

    // The key the loader published, re-derived exactly as the writer derived
    // it — this is what makes the store hand-off worth having.
    expect(readModelByPathFromOPFS).toHaveBeenCalledWith(
      `ifc/misc/box.${SCHEMA_VER}.glb`, 'sha123', 'gh-bldrs-ai', 'test-models', 'main')
    expect(loadProModule).toHaveBeenCalledWith('glbExport', expect.any(Function), expect.any(String), {drivePublic: false})
    expect(exportArtifact).toHaveBeenCalledWith({
      bytes: ARTIFACT_BYTES,
      options: {sourceBasename: 'box.ifc', stripBldrsMetadata: false},
      // No codec chosen, so nothing for the host to run and the module's own
      // pass-through is the export (#1842).
      compress: null,
    })
    expect(triggerDownload).toHaveBeenCalledWith(EXPORTED.blob, 'box.glb')
    expect(useStore.getState().snackMessage).toEqual({text: 'Exported box.glb (2.0 KB)', autoDismiss: true})
    expect(gtagEventWithCid).toHaveBeenCalledWith('export_model', {
      format: 'glb',
      bytes_bucket: '<1MB',
      source_kind: KIND_LABEL,
      portable: false,
      free_export: false,
      slot_taken: false,
    })
    // ...and its normalized twin, for the model on screen.
    expect(trackModelAction.mock.calls).toEqual([['export', expect.objectContaining({
      gate: 'none', source: 'hosted', routeKind: 'github', isAuthenticated: true,
    })]])
  })

  // The event goes out after the module load and conversion, and navigation
  // isn't locked meanwhile: the source is the model the export started on
  // (codex review on Share#1976).
  it('attributes the export to the model it started on, even after navigating mid-export', async () => {
    useStore.setState({modelPath: {kind: 'file', isUploadedFile: true, filepath: '/u.ifc'}})
    let releaseModule
    loadProModule.mockImplementation(() => new Promise((resolve) => {
      releaseModule = () => resolve({namespace: {exportArtifact}, charge: null})
    }))
    const {result} = renderHook(() => useExport())

    let running
    act(() => {
      running = result.current.run('glb', {})
    })
    await waitFor(() => expect(releaseModule).toBeDefined())
    // The user opens a GitHub model while the export is in flight.
    act(() => {
      useStore.setState({modelPath: {kind: 'provider', provider: 'github'}})
    })
    await act(async () => {
      releaseModule()
      await running
    })

    expect(trackModelAction.mock.calls).toEqual([['export', expect.objectContaining({
      gate: 'none', source: 'local', routeKind: 'local',
    })]])
  })

  // Share#1981: the delivered export names its model, with the value
  // real_model_open sends, so GA can count distinct models exported.
  it('sends model_export with the content_id of the model on screen', async () => {
    useStore.setState({modelPath: GITHUB_ROUTE})
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {})
    })

    expect(trackModelAction.mock.calls).toEqual([['export', expect.objectContaining({
      gate: 'none', contentId: GITHUB_CONTENT_ID,
    })]])
  })

  // The id is snapshotted when the user acts, like the source: the event goes
  // out after the module load, and a navigation meanwhile must not make the
  // export a "distinct model" of the next one.
  it('keeps the original model\'s content_id when the user navigates mid-export', async () => {
    useStore.setState({modelPath: LOCAL_ROUTE})
    let releaseModule
    loadProModule.mockImplementation(() => new Promise((resolve) => {
      releaseModule = () => resolve({namespace: {exportArtifact}, charge: null})
    }))
    const {result} = renderHook(() => useExport())

    let running
    act(() => {
      running = result.current.run('glb', {})
    })
    await waitFor(() => expect(releaseModule).toBeDefined())
    act(() => {
      useStore.setState({modelPath: GITHUB_ROUTE})
    })
    await act(async () => {
      releaseModule()
      await running
    })

    const [[, details]] = trackModelAction.mock.calls
    expect(details.contentId).toBe(LOCAL_CONTENT_ID)
    expect(details.contentId).not.toBe(GITHUB_CONTENT_ID)
  })

  // "Download again" replays a history row that may be another model, and
  // the row carries a share-path key, not real_model_open's value. Sending
  // the model on screen would count the wrong model, so it sends none.
  it('sends no content_id for a "Download again" of a history row', async () => {
    useStore.setState({modelPath: GITHUB_ROUTE})
    const {result} = renderHook(() => useExport())
    const row = {cacheKeyArgs: CACHE_KEY_ARGS, schemaVer: SCHEMA_VER, key: '/share/v/gh/other/repo/main/x.ifc'}

    await act(async () => {
      await result.current.run('glb', {}, row)
    })

    expect(trackModelAction).toHaveBeenCalledTimes(1)
    const [, details] = trackModelAction.mock.calls[0]
    expect(details.contentId).toBeUndefined()
    expect(details.source).toBeUndefined()
  })

  // Codex on #1980: a "Download again" row has no Drive download record,
  // so it replays the public word its own export gave. Without it a
  // link-shared file re-downloaded from history took a slot, or was refused
  // with the slots full.
  it('replays a history row\'s Drive public word to pro-module, and no word as private', async () => {
    const {result} = renderHook(() => useExport())
    const row = {cacheKeyArgs: CACHE_KEY_ARGS, schemaVer: SCHEMA_VER, key: '/share/v/g/1AbCdEfGhIjKlMnOpQrStUvWxYz'}

    await act(async () => {
      await result.current.run('glb', {}, {...row, drivePublic: true})
    })
    await act(async () => {
      await result.current.run('glb', {}, row)
    })

    expect(loadProModule.mock.calls.map((call) => call[3])).toEqual([{drivePublic: true}, {drivePublic: false}])
    expect(recordExport.mock.calls[0][0].drivePublic).toBe(true)
  })

  // codex review on Share#1976, round 2 (the export variant): Auth0 says
  // signed in before BaseRoutes has written the claims, so an export
  // delivered in that window read a Pro user's still-empty claims as free.
  // The tier is read once auth settles instead.
  it('sends model_export {none} with the settled tier, not the claims of mid-restore', async () => {
    useStore.setState({modelPath: {kind: 'provider', provider: 'github'}, isAuthResolved: false})
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {})
    })
    expect(triggerDownload).toHaveBeenCalled()
    expect(gtagEventWithCid).toHaveBeenCalledWith('export_model', expect.anything())
    expect(trackModelAction).not.toHaveBeenCalled()

    act(() => {
      useStore.getState().setAppMetadata({subscriptionStatus: 'sharePro'})
      useStore.getState().setIsAuthResolved(true, true)
    })

    await waitFor(() => expect(trackModelAction).toHaveBeenCalledTimes(1))
    const [action, details] = trackModelAction.mock.calls[0]
    expect(action).toBe('export')
    expect(details).toMatchObject({gate: 'none', source: 'hosted', routeKind: 'github'})
    expect(jest.requireActual('../privacy/analytics').modelActionTier(details)).toBe('pro')
  })

  it('hands the pro module the very bytes the size line quoted', async () => {
    // The codecs live in the host bundle, so the host compresses — but only
    // the pro module can turn bytes into a download, and the bytes it gets
    // are the cached ones the panel measured, not a second encode that is
    // merely supposed to match (#1842).
    const compressed = {
      withMetadata: new Uint8Array(900),
      withoutMetadata: new Uint8Array(400),
      strippedExtensions: ['BLDRS_spatial_tree'],
      mode: 'meshopt',
    }
    compressedExport.mockResolvedValue(compressed)
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {stripBldrsMetadata: true, compression: 'meshopt'})
    })

    const {compress} = exportArtifact.mock.calls[0][0]
    const forDownload = await compress(ARTIFACT_BYTES, {stripBldrsMetadata: true})

    // The last two arguments keep the estimate cache's cells apart — portable
    // vs native, and one Quality rung from another. A run that names no rung
    // resolves to the default rather than failing, which is what a
    // "Download again" row recorded before #1848 carries.
    expect(compressedExport).toHaveBeenCalledWith(
      expect.objectContaining({schemaVer: SCHEMA_VER}), 'meshopt', ARTIFACT_BYTES, false, 'balanced')
    expect(forDownload.bytes).toBe(compressed.withoutMetadata)
    expect(forDownload.withMetadataBytes).toBe(900)
    expect(forDownload.withoutMetadataBytes).toBe(400)
    expect(forDownload.mode).toBe('meshopt')
    // …and the choice is recorded, so "Download again" reproduces this file
    // rather than an uncompressed one at the size the row claims.
    expect(recordExport).toHaveBeenCalledWith(
      expect.objectContaining({options: {stripBldrsMetadata: true, compression: 'meshopt'}}),
      expect.anything(), expect.any(Function), expect.any(Function))
  })

  it('gzips through the host, and says the bytes really are gzipped', async () => {
    // The `.gz` on the filename hangs off what the hook REPORTS, not off what
    // was asked for (`pro/glbExport.js`), so this is the signal that decides
    // whether the user gets a name their unarchiver can believe.
    global.CompressionStream = NodeCompressionStream
    gzippedExport.mockResolvedValue({
      bytes: new Uint8Array(120),
      withMetadataBytes: 300,
      withoutMetadataBytes: 120,
      strippedExtensions: ['BLDRS_spatial_tree'],
      mode: 'meshopt',
    })
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {stripBldrsMetadata: true, compression: 'meshopt', gzip: true})
    })

    const {compress} = exportArtifact.mock.calls[0][0]
    const forDownload = await compress(ARTIFACT_BYTES, {stripBldrsMetadata: true})

    expect(gzippedExport).toHaveBeenCalledWith(
      expect.objectContaining({schemaVer: SCHEMA_VER}), 'meshopt', ARTIFACT_BYTES, false, 'balanced', true)
    // The raw cache is not consulted at all on this path — the gzipped one
    // reads through it and gzips the side that was chosen, so a second read
    // here would be a second encode.
    expect(compressedExport).not.toHaveBeenCalled()
    expect(forDownload.bytes.byteLength).toBe(120)
    expect(forDownload.withMetadataBytes).toBe(300)
    expect(forDownload.isGzipped).toBe(true)
    delete global.CompressionStream
  })

  it('gzips with no codec at all, which is the case worth having', async () => {
    // Compression None plus gzip is the selection the #1854 measurement is
    // about: on a real model the container is ~92% of the file and gzip takes
    // ~6× off it losslessly. It has to reach the host hook, which through
    // #1843 only ran for `portable || codec`.
    global.CompressionStream = NodeCompressionStream
    gzippedExport.mockResolvedValue({
      bytes: new Uint8Array(64),
      withMetadataBytes: 64,
      withoutMetadataBytes: 40,
      strippedExtensions: [],
      mode: 'none',
    })
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {stripBldrsMetadata: false, compression: 'none', gzip: true})
    })

    const {compress} = exportArtifact.mock.calls[0][0]
    expect(compress).not.toBeNull()
    expect((await compress(ARTIFACT_BYTES, {stripBldrsMetadata: false})).isGzipped).toBe(true)
    delete global.CompressionStream
  })

  it('never claims gzip in a browser that cannot do it', async () => {
    // Safari before 16.4 has no `CompressionStream`, and a "Download again"
    // row replays the options its export ran with — so a row recorded on
    // Chrome can ask for gzip here. Uncompressed bytes under a `.gz` name is
    // the one failure this option must not have, so the request is dropped:
    // no hook at all, and the pro module hands over a plain `.glb`.
    expect(global.CompressionStream).toBeUndefined()
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {stripBldrsMetadata: false, compression: 'none', gzip: true})
    })

    expect(gzippedExport).not.toHaveBeenCalled()
    expect(exportArtifact.mock.calls[0][0].compress).toBeNull()
  })

  it('records whether the file really was gzipped, not whether it was asked for', async () => {
    // Same rule the codec fallback follows, and for the same reason: the row
    // is what "Download again" replays and what sits beside the row's size.
    exportArtifact.mockResolvedValue(
      {...EXPORTED, stats: {...EXPORTED.stats, compression: 'none', gzip: false}})
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {stripBldrsMetadata: false, compression: 'none', gzip: true})
    })

    expect(recordExport).toHaveBeenCalledWith(
      expect.objectContaining({options: expect.objectContaining({gzip: false})}),
      expect.anything(), expect.any(Function), expect.any(Function))
  })

  it('keeps the with-metadata side when the toggle is on', async () => {
    const compressed = {
      withMetadata: new Uint8Array(900),
      withoutMetadata: new Uint8Array(400),
      strippedExtensions: [],
      mode: 'draco',
    }
    compressedExport.mockResolvedValue(compressed)
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {stripBldrsMetadata: false, compression: 'draco'})
    })

    const {compress} = exportArtifact.mock.calls[0][0]
    expect((await compress(ARTIFACT_BYTES, {stripBldrsMetadata: false})).bytes)
      .toBe(compressed.withMetadata)
  })

  it('records the codec the module reports it applied, when that differs from the request', async () => {
    // The encoder could not load, the host fell back to the uncompressed
    // file (`glbCompression.js`), and the pro module said so in `stats`. The
    // history row's options are what "Download again" replays and what sits
    // beside the row's size, so they describe the file that exists. `gzip`
    // rides on the same rule for the same reason (#1854): a browser without
    // `CompressionStream` produces a plain `.glb`, and a row replaying
    // `gzip: true` would re-download something its own size does not
    // describe.
    exportArtifact.mockResolvedValue({...EXPORTED, stats: {...EXPORTED.stats, compression: 'none'}})
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {stripBldrsMetadata: false, compression: 'draco'})
    })

    expect(recordExport).toHaveBeenCalledWith(
      expect.objectContaining({options: {stripBldrsMetadata: false, compression: 'none', gzip: false}}),
      expect.anything(), expect.any(Function), expect.any(Function))
  })

  it('fails the export rather than downloading an uncompressed file as a compressed one', async () => {
    // A null cache entry means the encode failed. Handing over the input
    // instead would save a file whose name and reported size say Draco and
    // whose contents do not.
    compressedExport.mockResolvedValue(null)
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {compression: 'draco'})
    })

    const {compress} = exportArtifact.mock.calls[0][0]
    await expect(compress(ARTIFACT_BYTES, {stripBldrsMetadata: false})).rejects.toThrow(/draco/)
  })

  it('runs the host hook for Portable even with no codec chosen (#1843)', async () => {
    // The predicate is `portable || codec`, not the codec alone: Portable is a
    // host rewrite the pro module cannot do, and with it on there IS something
    // for the host to run at compression None. Without this the toggle would
    // silently export the batched-native file.
    const rewritten = {
      withMetadata: new Uint8Array(700),
      withoutMetadata: new Uint8Array(500),
      strippedExtensions: ['BLDRS_spatial_tree'],
      mode: 'none',
    }
    compressedExport.mockResolvedValue(rewritten)
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {stripBldrsMetadata: true, compression: 'none', portable: true})
    })

    const {compress} = exportArtifact.mock.calls[0][0]
    expect(compress).toEqual(expect.any(Function))
    expect((await compress(ARTIFACT_BYTES, {stripBldrsMetadata: true})).bytes)
      .toBe(rewritten.withoutMetadata)
    // The last two arguments are what keep the estimate cache's cells apart —
    // portable and native are different FILES at the same codec, and so are
    // two Quality rungs.
    expect(compressedExport).toHaveBeenCalledWith(
      expect.objectContaining({schemaVer: SCHEMA_VER}), 'none', ARTIFACT_BYTES, true, 'balanced')
    // …and the choice is recorded, so "Download again" reproduces the portable
    // file rather than the batched-native one at the size the row claims.
    expect(recordExport).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {stripBldrsMetadata: true, compression: 'none', portable: true},
      }),
      expect.anything(), expect.any(Function), expect.any(Function))
    expect(gtagEventWithCid.mock.calls[0][1].portable).toBe(true)
  })

  it('still runs no hook when neither control asks for one', async () => {
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {stripBldrsMetadata: false, compression: 'none', portable: false})
    })

    expect(exportArtifact.mock.calls[0][0].compress).toBeNull()
  })

  it('reports the source KIND, never the cache key\'s first namespace', async () => {
    // `cacheKeyArgs.ns1` is the repo OWNER for a GitHub model — a login, in a
    // GA event — and the constant 'BldrsLocalStorage' for every other source,
    // so it was both leaky and uninformative (#1834).
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {})
    })

    const [, params] = gtagEventWithCid.mock.calls[0]
    expect(params.source_kind).toBe('github')
    expect(Object.values(params)).not.toContain(CACHE_KEY_ARGS.ns1)
  })

  it('says so, rather than guessing, when the artifact carries no kind', async () => {
    // A "Download again" hands `run` a history row, which has no kind on it.
    useStore.getState().setGlbArtifact({cacheKeyArgs: CACHE_KEY_ARGS, schemaVer: SCHEMA_VER, writtenAt: 1})
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {})
    })

    expect(gtagEventWithCid.mock.calls[0][1].source_kind).toBe('unknown')
  })

  it('records the export in history, with the artifact fields "Download again" needs', async () => {
    window.history.pushState({}, '', '/share/v/p/index.ifc')
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {})
    })

    expect(recordExport).toHaveBeenCalledWith(
      {
        key: '/share/v/p/index.ifc',
        drivePublic: false,
        format: 'glb',
        bytes: EXPORTED.blob.size,
        title: 'box.ifc',
        cacheKeyArgs: CACHE_KEY_ARGS,
        schemaVer: SCHEMA_VER,
        options: {},
      },
      // The mirror is per-account (exportHistory.js): OPFS is shared by every
      // Auth0 account on this browser, so the sub is what addresses the file.
      'github|1234567',
      expect.any(Function),
      expect.any(Function),
    )
  })

  it('records the options the export ran with, so a re-download reproduces the file', async () => {
    // Otherwise "Download again" falls back to the defaults and hands back a
    // file with every BLDRS_* payload the user stripped (§4.5).
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {stripBldrsMetadata: true})
    })

    expect(recordExport.mock.calls[0][0].options).toEqual({stripBldrsMetadata: true})
  })

  it('applies the claims of the token it force-refreshes after recording', async () => {
    // `record-export` has just appended a row to Auth0 app_metadata; the
    // refresh exists so every reader catches up. Discarding the token left
    // `store.appMetadata` on the PRE-export list, and reopening the Export
    // tab hydrated the mirror from it — dropping the export the user had
    // just made until a reload (#1834).
    const refreshedExports = [{id: 'server-1', key: '/share/v/p/index.ifc', format: 'glb', bytes: 2048}]
    getAccessTokenSilently.mockImplementation((params) => Promise.resolve(params?.cacheMode === 'off' ?
      jwtWithAppMetadata({subscriptionStatus: 'sharePro', exports: refreshedExports}) :
      'cached-token'))
    // The real `recordExport` calls this after a successful server write.
    recordExport.mockImplementation(async (_entry, _sub, _getToken, refreshToken) => {
      await refreshToken()
      return {recorded: true, status: 200, exports: []}
    })
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {})
    })

    expect(useStore.getState().appMetadata).toEqual(
      {subscriptionStatus: 'sharePro', exports: refreshedExports})
  })

  it('leaves app_metadata alone when the refreshed token carries no claim', async () => {
    // The mock Auth0 provider's tokens carry none, and tests inject metadata
    // directly — clearing the store on a claimless token would undo that.
    useStore.getState().setAppMetadata({subscriptionStatus: 'sharePro'})
    recordExport.mockImplementation(async (_entry, _sub, _getToken, refreshToken) => {
      await refreshToken()
      return {recorded: true, status: 200, exports: []}
    })
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {})
    })

    expect(useStore.getState().appMetadata).toEqual({subscriptionStatus: 'sharePro'})
  })

  describe('when record-export refuses an export pro-module already served', () => {
    const refused = {recorded: false, status: 403, exports: [], reason: 'export_slot_missing'}

    it('forgets the memoised Pro module and refreshes the claims, for a delivery with no slots header', async () => {
      // The account lost Pro while this page stayed open: the memo would
      // otherwise keep exporting models holding no slot for the rest of the
      // session.
      getAccessTokenSilently.mockImplementation((params) => Promise.resolve(params?.cacheMode === 'off' ?
        jwtWithAppMetadata({subscriptionStatus: 'free'}) :
        'cached-token'))
      useStore.getState().setAppMetadata({subscriptionStatus: 'sharePro'})
      recordExport.mockResolvedValue(refused)
      const {result} = renderHook(() => useExport())

      await act(async () => {
        await result.current.run('glb', {})
      })

      expect(forgetProModule).toHaveBeenCalledWith('glbExport')
      await waitFor(() => expect(useStore.getState().appMetadata).toEqual({subscriptionStatus: 'free'}))
    })

    it('leaves the loader alone for a free-tier delivery, which was never memoised', async () => {
      loadProModule.mockResolvedValue({namespace: {exportArtifact}, slots: {limit: 2, used: 1, remaining: 1, taken: true}})
      recordExport.mockResolvedValue(refused)
      const {result} = renderHook(() => useExport())

      await act(async () => {
        await result.current.run('glb', {})
      })

      expect(forgetProModule).not.toHaveBeenCalled()
    })

    it('leaves the loader alone on a 401, which an expired token or an Auth0 outage also gives', async () => {
      recordExport.mockResolvedValue({recorded: false, status: 401, exports: [], reason: 'invalid_auth0_token'})
      const {result} = renderHook(() => useExport())

      await act(async () => {
        await result.current.run('glb', {})
      })

      expect(forgetProModule).not.toHaveBeenCalled()
    })

    it('leaves the loader alone when record-export accepts the export', async () => {
      const {result} = renderHook(() => useExport())

      await act(async () => {
        await result.current.run('glb', {})
      })

      expect(forgetProModule).not.toHaveBeenCalled()
    })
  })

  it('still reports success when recording the export fails', async () => {
    // The file is in the user's Downloads either way; a history write that
    // couldn't happen must not read as a failed export.
    recordExport.mockRejectedValue(new Error('history unavailable'))
    const {result} = renderHook(() => useExport())

    let returned
    await act(async () => {
      returned = await result.current.run('glb', {})
    })

    expect(returned).toEqual({filename: 'box.glb', stats: EXPORTED.stats})
    expect(useStore.getState().snackMessage.text).toMatch(/^Exported box.glb/)
    expect(result.current.error).toBeNull()
  })

  it('passes the caller\'s strip option through to the module', async () => {
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {stripBldrsMetadata: true})
    })

    expect(exportArtifact.mock.calls[0][0].options.stripBldrsMetadata).toBe(true)
  })

  it('reports the export as in flight while it runs, through the SHARED store flag', async () => {
    // In the store rather than in the hook, because `ExportSection` and
    // `ExportsList` each hold their own instance of this hook: per-instance
    // state left "Download again" live while Download GLB was running, and
    // the two exports then raced each other's history write (#1834).
    let release
    loadProModule.mockReturnValue(new Promise((resolve) => {
      release = () => resolve({namespace: {exportArtifact}, slots: null})
    }))
    const {result} = renderHook(() => useExport())
    const other = renderHook(() => useExport())

    let running
    await act(() => {
      running = result.current.run('glb', {})
    })
    expect(result.current.isExporting).toBe(true)
    expect(useStore.getState().isExportInFlight).toBe(true)
    // The second caller sees it too — that is the whole point.
    expect(other.result.current.isExporting).toBe(true)

    await act(async () => {
      release()
      await running
    })
    expect(result.current.isExporting).toBe(false)
    expect(other.result.current.isExporting).toBe(false)
    expect(useStore.getState().isExportInFlight).toBe(false)
  })

  it('holds the shared flag until the history record settles', async () => {
    // The flag serialises the mirror's read-modify-write, so it has to
    // outlive the download: released at download time, a second export
    // could race the first one's pending record and lose a row.
    let settleRecord
    recordExport.mockReturnValue(new Promise((resolve) => {
      settleRecord = () => resolve({recorded: true, status: 200, exports: []})
    }))
    const {result} = renderHook(() => useExport())

    let running
    await act(() => {
      running = result.current.run('glb', {})
    })
    // Download done (the snackbar fired), record still pending.
    expect(useStore.getState().snackMessage?.text).toMatch(/^Exported /)
    expect(useStore.getState().isExportInFlight).toBe(true)

    await act(async () => {
      settleRecord()
      await running
    })
    expect(useStore.getState().isExportInFlight).toBe(false)
  })

  it('clears the shared flag when the export fails', async () => {
    // Otherwise one failure disables every export control in the tab until
    // the page is reloaded.
    loadProModule.mockRejectedValue(new ProModuleDeniedError(403, 'denied'))
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {})
    })

    expect(useStore.getState().isExportInFlight).toBe(false)
  })

  it('surfaces a denial as an upgrade prompt and force-refreshes the JWT', async () => {
    // The server is the authority: a 403 here means the client's tier badge
    // was stale, so the refreshed token is what makes every app_metadata
    // reader agree with it.
    loadProModule.mockRejectedValue(new ProModuleDeniedError(403, 'denied'))
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {})
    })

    expect(useStore.getState().snackMessage)
      .toEqual({text: 'Export requires a Pro subscription', autoDismiss: true})
    expect(getAccessTokenSilently).toHaveBeenCalledWith(
      expect.objectContaining({cacheMode: 'off', useRefreshTokens: true}))
    expect(triggerDownload).not.toHaveBeenCalled()
    expect(recordExport).not.toHaveBeenCalled()
    // No export_model for a file that never landed; one export_failed instead.
    expect(gtagEventWithCid.mock.calls.map(([name]) => name)).toEqual(['export_failed'])
    expect(gtagEventWithCid).toHaveBeenCalledWith('export_failed', {format: 'glb', reason: 'denied'})
    // Denied is a failure, not a gate verdict: no model_export.
    expect(trackModelAction).not.toHaveBeenCalled()
    expect(result.current.error).toBeInstanceOf(ProModuleDeniedError)
  })

  describe('a free user\'s export, decided by model slots (§4.8)', () => {
    const localRoute = () => handleRoute('/share/v/local-only', {'*': '0b9f4c2e-7d1a-4c55-9f0e-3a1b2c3d4e5f.ifc/12/34'})
    const LOCAL_KEY = '/share/v/local-only/0b9f4c2e-7d1a-4c55-9f0e-3a1b2c3d4e5f.ifc'
    const TAKEN = {limit: 2, used: 1, remaining: 1, nextFreeAt: '2026-11-03T12:00:00.000Z', taken: true}

    beforeEach(() => {
      useStore.getState().setAppPrefix('/share')
      useStore.getState().setModelPath(localRoute())
      loadProModule.mockResolvedValue({namespace: {exportArtifact}, slots: TAKEN})
    })

    it('names the model by its slot key — the same one to pro-module and to record-export', async () => {
      // The element path in the URL is not part of the key, and the local
      // file's key is the /v/local-only/ path its open was given.
      window.history.pushState({}, '', '/share/v/local-only/0b9f4c2e-7d1a-4c55-9f0e-3a1b2c3d4e5f.ifc/12/34')
      const {result} = renderHook(() => useExport())

      await act(async () => {
        await result.current.run('glb', {})
      })

      expect(loadProModule).toHaveBeenCalledWith('glbExport', expect.any(Function), LOCAL_KEY, {drivePublic: false})
      expect(recordExport.mock.calls[0][0].key).toBe(LOCAL_KEY)
      expect(gtagEventWithCid).toHaveBeenCalledWith('export_model',
        expect.objectContaining({free_export: true, slot_taken: true}))
    })

    it('exports a model opened from a long presigned URL under a digest key, with no credential in it', async () => {
      // jsdom has no SubtleCrypto; Node's is the same Web Crypto API.
      const realCrypto = global.crypto
      Object.defineProperty(global, 'crypto', {value: webcrypto, configurable: true})
      try {
        const url = `https://bucket.s3.amazonaws.com/tower.ifc?X-Amz-Security-Token=${'t0k3n'.repeat(300)}&X-Amz-Signature=abc`
        useStore.getState().setModelPath(handleRoute('/share/v/u', {'*': url}))
        const {result} = renderHook(() => useExport())

        await act(async () => {
          await result.current.run('glb', {})
        })

        const key = loadProModule.mock.calls[0][2]
        expect(key).toMatch(/^\/share\/v\/u\/sha256-[0-9a-f]{64}$/)
        expect(key).not.toMatch(/X-Amz|t0k3n|\?|amazonaws/)
        // ...the same key the Export tab and an open would compute, and the
        // one recorded — so the export is decided and recorded as one model.
        expect(key).toBe(await modelSlotKey(useStore.getState().modelPath, '/share'))
        expect(recordExport.mock.calls[0][0].key).toBe(key)
        expect(triggerDownload).toHaveBeenCalled()
      } finally {
        Object.defineProperty(global, 'crypto', {value: realCrypto, configurable: true})
      }
    })

    it('snapshots the key when the run starts, so navigating mid-export cannot rename the model', async () => {
      let release
      loadProModule.mockReturnValue(new Promise((resolve) => {
        release = () => resolve({namespace: {exportArtifact}, slots: TAKEN})
      }))
      const {result} = renderHook(() => useExport())

      let running
      act(() => {
        running = result.current.run('glb', {})
      })
      useStore.getState().setModelPath(handleRoute('/share/v/p', {'*': 'other.ifc'}))
      await act(async () => {
        release()
        await running
      })

      expect(loadProModule.mock.calls[0][2]).toBe(LOCAL_KEY)
      expect(recordExport.mock.calls[0][0].key).toBe(LOCAL_KEY)
    })

    it('replays a "Download again" row under the key it was recorded with', async () => {
      const {result} = renderHook(() => useExport())
      const source = {cacheKeyArgs: CACHE_KEY_ARGS, schemaVer: SCHEMA_VER, key: '/share/v/g/drive-file'}

      await act(async () => {
        await result.current.run('glb', {}, source)
      })

      expect(loadProModule.mock.calls[0][2]).toBe('/share/v/g/drive-file')
      expect(recordExport.mock.calls[0][0].key).toBe('/share/v/g/drive-file')
    })

    it('puts the slots the delivery reports into the store, with this model among the held keys', async () => {
      useStore.getState().setModelSlots(
        {sub: 'github|1234567', limit: 2, used: 0, remaining: 2, nextFreeAt: null, keys: []})
      const {result} = renderHook(() => useExport())

      await act(async () => {
        await result.current.run('glb', {})
      })

      expect(useStore.getState().modelSlots).toEqual({
        sub: 'github|1234567', limit: 2, used: 1, remaining: 1, nextFreeAt: TAKEN.nextFreeAt, keys: [LOCAL_KEY],
        publicKeys: [],
      })
    })

    it('files a public model\'s delivery under publicKeys, not as a held slot', async () => {
      loadProModule.mockResolvedValue({namespace: {exportArtifact}, slots: {...TAKEN, taken: false, public: true}})
      const {result} = renderHook(() => useExport())

      await act(async () => {
        await result.current.run('glb', {})
      })

      expect(useStore.getState().modelSlots).toMatchObject({keys: [], publicKeys: [LOCAL_KEY]})
      expect(gtagEventWithCid).toHaveBeenCalledWith('export_model',
        expect.objectContaining({free_export: true, slot_taken: false}))
    })

    it('then takes the slots record-export reports, keys and all', async () => {
      const afterRecord = {limit: 2, used: 2, remaining: 0, nextFreeAt: TAKEN.nextFreeAt, keys: ['/share/v/g/x', LOCAL_KEY]}
      recordExport.mockResolvedValue({recorded: true, status: 200, exports: [], modelSlots: afterRecord})
      const {result} = renderHook(() => useExport())

      await act(async () => {
        await result.current.run('glb', {})
      })

      expect(useStore.getState().modelSlots).toEqual({sub: 'github|1234567', ...afterRecord, publicKeys: []})
    })

    it('reports a re-export of a model already holding a slot as not taking one', async () => {
      loadProModule.mockResolvedValue({namespace: {exportArtifact}, slots: {...TAKEN, taken: false}})
      const {result} = renderHook(() => useExport())

      await act(async () => {
        await result.current.run('glb', {})
      })

      expect(gtagEventWithCid).toHaveBeenCalledWith('export_model',
        expect.objectContaining({free_export: true, slot_taken: false}))
    })

    it('stores nothing for a Pro delivery', async () => {
      loadProModule.mockResolvedValue({namespace: {exportArtifact}, slots: null})
      const {result} = renderHook(() => useExport())

      await act(async () => {
        await result.current.run('glb', {})
      })

      expect(useStore.getState().modelSlots).toBeNull()
    })

    it('with every slot taken by other models, says when one frees up, and stores the slots', async () => {
      const full = {limit: 2, used: 2, remaining: 0, nextFreeAt: '2026-10-31T09:00:00.000Z', keys: ['/a/v/p/a.ifc', '/a/v/g/b']}
      loadProModule.mockRejectedValue(new ProModuleDeniedError(403, 'denied', {reason: NO_FREE_SLOT_REASON, modelSlots: full}))
      const {result} = renderHook(() => useExport())

      await act(async () => {
        await result.current.run('glb', {})
      })

      expect(useStore.getState().snackMessage.text).toBe(noFreeSlotMessage(full))
      expect(useStore.getState().snackMessage.text)
        .toMatch(/^Your 2 free model slots for this week are taken by other models\. The next one frees up /)
      expect(useStore.getState().modelSlots).toEqual({sub: 'github|1234567', ...full, publicKeys: []})
      expect(gtagEventWithCid).toHaveBeenCalledWith('export_failed', {format: 'glb', reason: 'no_slot'})
      // The tier was right; there is no stale badge to refresh.
      expect(getAccessTokenSilently).not.toHaveBeenCalledWith(expect.objectContaining({cacheMode: 'off'}))
      expect(triggerDownload).not.toHaveBeenCalled()
      expect(recordExport).not.toHaveBeenCalled()
      // No free slot refused it: export_failed{no_slot}, shadowed by
      // model_export {blocked}, free-tier by definition.
      expect(trackModelAction.mock.calls).toEqual([['export', expect.objectContaining({gate: 'blocked', tier: 'free'})]])
    })

    // Share#1981: the refused export names the model it was refused for.
    it('names the model on screen on model_export {blocked}', async () => {
      useStore.setState({modelPath: GITHUB_ROUTE})
      loadProModule.mockRejectedValue(new ProModuleDeniedError(403, 'denied', {
        reason: NO_FREE_SLOT_REASON,
        modelSlots: {limit: 2, used: 2, remaining: 0, nextFreeAt: '2026-10-09T09:00:00.000Z', keys: []},
      }))
      const {result} = renderHook(() => useExport())

      await act(async () => {
        await result.current.run('glb', {})
      })

      expect(trackModelAction.mock.calls).toEqual([['export', expect.objectContaining({
        gate: 'blocked', tier: 'free', contentId: GITHUB_CONTENT_ID,
      })]])
    })
  })

  describe('a slots-full refusal that contradicts the locally paid tier', () => {
    const full = {limit: 2, used: 2, remaining: 0, nextFreeAt: '2026-10-31T09:00:00.000Z', keys: ['/a/v/p/a.ifc', '/a/v/g/b']}

    beforeEach(() => {
      loadProModule.mockRejectedValue(
        new ProModuleDeniedError(403, 'denied', {reason: NO_FREE_SLOT_REASON, modelSlots: full}))
    })

    it('refreshes the claim, so the tier flips to free and the gate shows', async () => {
      // The JWT still says Pro for a canceled account; `ExportSection` hides
      // the slots and the gate while `getTier` says PAID, so storing the
      // slots alone left every click repeating the refusal.
      useStore.getState().setAppMetadata({subscriptionStatus: 'sharePro'})
      getAccessTokenSilently.mockImplementation((params) => Promise.resolve(params?.cacheMode === 'off' ?
        jwtWithAppMetadata({subscriptionStatus: 'canceled'}) :
        'cached-token'))
      const {result} = renderHook(() => useExport())

      await act(async () => {
        await result.current.run('glb', {})
      })

      expect(getAccessTokenSilently).toHaveBeenCalledWith(
        expect.objectContaining({cacheMode: 'off', useRefreshTokens: true}))
      expect(useStore.getState().appMetadata).toEqual({subscriptionStatus: 'canceled'})
      expect(useStore.getState().modelSlots).toEqual({sub: 'github|1234567', ...full, publicKeys: []})
    })

    // The refusal proves the free allowance was what blocked it, so the
    // normalized event is free-tier even while the local claim still says
    // Pro (codex review on Share#1976). Run through the real derivation.
    it('reports model_export {blocked} as free, not pro', async () => {
      useStore.getState().setAppMetadata({subscriptionStatus: 'sharePro'})
      const {result} = renderHook(() => useExport())

      await act(async () => {
        await result.current.run('glb', {})
      })

      expect(trackModelAction).toHaveBeenCalledTimes(1)
      const [action, details] = trackModelAction.mock.calls[0]
      expect(action).toBe('export')
      // An explicit tier, which trackModelActionWhenAuthSettled sends as is,
      // never re-derived from the (Pro) claim in the store
      // (privacy/modelActionTracking.test.js pins that half).
      expect(details).toMatchObject({gate: 'blocked', tier: 'free'})
      expect(useStore.getState().appMetadata).toEqual({subscriptionStatus: 'sharePro'})
      expect(jest.requireActual('../privacy/analytics').modelActionTier({
        ...details, appMetadata: useStore.getState().appMetadata, isAuthenticated: true,
      })).toBe('free')
    })
  })

  it('does nothing premium when no artifact has been published yet', async () => {
    useStore.getState().setGlbArtifact(null)
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {})
    })

    expect(loadProModule).not.toHaveBeenCalled()
    expect(readModelByPathFromOPFS).not.toHaveBeenCalled()
    expect(useStore.getState().snackMessage.text).toMatch(/still being prepared/)
    // A run that delivers nothing is still one export_failed (codex on #1968).
    expect(gtagEventWithCid.mock.calls).toEqual([['export_failed', {format: 'glb', reason: 'unavailable'}]])
    expect(trackModelAction).not.toHaveBeenCalled()
  })

  it('tells the user to reload when the artifact has been evicted from OPFS', async () => {
    readModelByPathFromOPFS.mockResolvedValue(null)
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {})
    })

    expect(loadProModule).not.toHaveBeenCalled()
    expect(useStore.getState().snackMessage.text).toMatch(/reload the model/)
    expect(gtagEventWithCid.mock.calls).toEqual([['export_failed', {format: 'glb', reason: 'unavailable'}]])
  })

  it('rejects a format that has not shipped', async () => {
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await expect(result.current.run('usdz', {})).rejects.toThrow(/no shipped export format/)
    })
  })
})


describe('size reporting', () => {
  it('formats a human size', () => {
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(1024 * 1024 * 1024 * 2)).toBe('2.0 GB')
  })

  it('buckets a size for analytics rather than reporting the exact bytes', () => {
    expect(bytesBucket(1)).toBe('<1MB')
    expect(bytesBucket(5 * 1024 * 1024)).toBe('1-10MB')
    expect(bytesBucket(50 * 1024 * 1024)).toBe('10-100MB')
    expect(bytesBucket(500 * 1024 * 1024)).toBe('>100MB')
  })
})


// `export_failed`'s `reason` (Share#1964), the same three-way split the
// hook's catch handles.
describe('exportFailureReason', () => {
  it('names a refusal for want of a free slot, a server denial, and anything else', () => {
    expect(exportFailureReason(new ProModuleDeniedError(403, 'full', {reason: NO_FREE_SLOT_REASON}))).toBe('no_slot')
    expect(exportFailureReason(new ProModuleDeniedError(403, 'denied'))).toBe('denied')
    expect(exportFailureReason(new Error('encoder blew up'))).toBe('error')
  })
})
