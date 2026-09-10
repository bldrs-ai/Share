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
const ARTIFACT_BYTES = new Uint8Array([1, 2, 3, 4])
const EXPORTED = {
  blob: new Blob([new Uint8Array(2048)], {type: 'model/gltf-binary'}),
  filename: 'box.glb',
  stats: {inputBytes: 4096, outputBytes: 2048, strippedExtensions: []},
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
    useStore.getState().setGlbArtifact({cacheKeyArgs: CACHE_KEY_ARGS, schemaVer: SCHEMA_VER, writtenAt: 1})
    useStore.getState().setSnackMessage(null)
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
      source_kind: 'gh-bldrs-ai',
    })
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
      },
      expect.any(Function),
      expect.any(Function),
    )
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

  it('reports the export as in flight while it runs', async () => {
    let release
    loadProModule.mockReturnValue(new Promise((resolve) => {
      release = () => resolve({exportArtifact})
    }))
    const {result} = renderHook(() => useExport())

    let running
    await act(() => {
      running = result.current.run('glb', {})
    })
    expect(result.current.isExporting).toBe(true)

    await act(async () => {
      release()
      await running
    })
    expect(result.current.isExporting).toBe(false)
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
