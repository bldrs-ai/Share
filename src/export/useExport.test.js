import {act, renderHook} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedIn} from '../__mocks__/authentication'
import {readModelByPathFromOPFS} from '../OPFS/utils'
import {gtagEvent} from '../privacy/analytics'
import useStore from '../store/useStore'
import {triggerDownload} from './download'
import {recordExport} from './exportHistory'
import {ProModuleDeniedError, loadProModule} from './proModuleLoader'
import useExport, {bytesBucket, formatBytes} from './useExport'


jest.mock('../OPFS/utils', () => ({readModelByPathFromOPFS: jest.fn()}))
jest.mock('../privacy/analytics', () => ({gtagEvent: jest.fn()}))
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
    getAccessTokenSilently = jest.fn().mockResolvedValue('test-token')
    mockedUseAuth0.mockReturnValue({...mockedUserLoggedIn, getAccessTokenSilently})
    recordExport.mockResolvedValue({recorded: true, status: 200, exports: []})
    exportArtifact = jest.fn().mockReturnValue(EXPORTED)
    loadProModule.mockResolvedValue({exportArtifact})
    readModelByPathFromOPFS.mockResolvedValue({
      arrayBuffer: () => Promise.resolve(ARTIFACT_BYTES.buffer),
    })
    useStore.getState().setGlbArtifact(
      {cacheKeyArgs: CACHE_KEY_ARGS, schemaVer: SCHEMA_VER, writtenAt: 1, kindLabel: KIND_LABEL})
    useStore.getState().setAppMetadata(null)
    useStore.getState().setSnackMessage(null)
    useStore.getState().setIsExportInFlight(false)
  })

  afterAll(() => {
    useStore.getState().setGlbArtifact(null)
  })

  it('reads the artifact at the published key, exports it and downloads the result', async () => {
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {stripBldrsMetadata: false})
    })

    // The key the loader published, re-derived exactly as the writer derived
    // it — this is what makes the store hand-off worth having.
    expect(readModelByPathFromOPFS).toHaveBeenCalledWith(
      `ifc/misc/box.${SCHEMA_VER}.glb`, 'sha123', 'gh-bldrs-ai', 'test-models', 'main')
    expect(loadProModule).toHaveBeenCalledWith('glbExport', expect.any(Function))
    expect(exportArtifact).toHaveBeenCalledWith({
      bytes: ARTIFACT_BYTES,
      options: {sourceBasename: 'box.ifc', stripBldrsMetadata: false},
    })
    expect(triggerDownload).toHaveBeenCalledWith(EXPORTED.blob, 'box.glb')
    expect(useStore.getState().snackMessage).toEqual({text: 'Exported box.glb (2.0 KB)', autoDismiss: true})
    expect(gtagEvent).toHaveBeenCalledWith('export_model', {
      format: 'glb',
      bytes_bucket: '<1MB',
      source_kind: KIND_LABEL,
    })
  })

  it('reports the source KIND, never the cache key\'s first namespace', async () => {
    // `cacheKeyArgs.ns1` is the repo OWNER for a GitHub model — a login, in a
    // GA event — and the constant 'BldrsLocalStorage' for every other source,
    // so it was both leaky and uninformative (#1834).
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {})
    })

    const [, params] = gtagEvent.mock.calls[0]
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

    expect(gtagEvent.mock.calls[0][1].source_kind).toBe('unknown')
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
      release = () => resolve({exportArtifact})
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
    expect(gtagEvent).not.toHaveBeenCalled()
    expect(result.current.error).toBeInstanceOf(ProModuleDeniedError)
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
  })

  it('tells the user to reload when the artifact has been evicted from OPFS', async () => {
    readModelByPathFromOPFS.mockResolvedValue(null)
    const {result} = renderHook(() => useExport())

    await act(async () => {
      await result.current.run('glb', {})
    })

    expect(loadProModule).not.toHaveBeenCalled()
    expect(useStore.getState().snackMessage.text).toMatch(/reload the model/)
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
