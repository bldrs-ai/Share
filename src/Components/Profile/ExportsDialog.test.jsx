import React from 'react'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {doesFileExistInOPFS} from '../../OPFS/utils'
import {RouteThemeCtx} from '../../Share.fixture'
import {mockedUseAuth0, mockedUserLoggedIn} from '../../__mocks__/authentication'
import {hydrateExports, loadExports} from '../../export/exportHistory'
import useStore from '../../store/useStore'
import ExportsDialog from './ExportsDialog'


jest.mock('../../OPFS/utils', () => ({doesFileExistInOPFS: jest.fn()}))
jest.mock('../../export/exportHistory', () => ({
  hydrateExports: jest.fn(),
  loadExports: jest.fn(),
  subscribeToExports: jest.fn(() => () => {}),
}))
// The hook has its own suite; the dialog only needs `run` to exist.
const mockRun = jest.fn()
jest.mock('../../export/useExport', () => ({
  __esModule: true,
  default: () => ({run: mockRun, isExporting: false, error: null}),
  formatBytes: (bytes) => `${bytes} B`,
}))


// The sub of `mockedUserLoggedIn`, which addresses this account's mirror.
const SUB = 'github|1234567'


const CACHE_KEY_ARGS = {
  ns1: 'BldrsLocalStorage',
  ns2: 'V1',
  ns3: 'Projects',
  sourcePath: 'index.ifc',
  sourceHash: 'sha123',
}


/**
 * @param {object} [overrides]
 * @return {object} a history row
 */
function aRow(overrides = {}) {
  return {
    id: 'row-1',
    key: '/share/v/p/index.ifc',
    title: 'index.ifc',
    format: 'glb',
    bytes: 2048,
    exportedAt: new Date().toISOString(),
    cacheKeyArgs: CACHE_KEY_ARGS,
    schemaVer: '0.21.0-batched',
    options: {stripBldrsMetadata: true},
    ...overrides,
  }
}


/**
 * Mount inside act so BOTH post-mount effects — the history read and the
 * OPFS availability probe that follows it — settle before any assertion.
 * Rendering bare leaves their `setState`s outside act(), which is noise in
 * the console rather than a failure (PLAYBOOK §"Keep the test console clean").
 *
 * @param {boolean} [isDialogDisplayed]
 * @return {Promise<void>}
 */
async function renderDialog(isDialogDisplayed = true) {
  await act(async () => {
    render(
      <ExportsDialog isDialogDisplayed={isDialogDisplayed} setIsDialogDisplayed={() => {}}/>,
      {wrapper: RouteThemeCtx})
    // Yield inside act() so the effects' promise chains run here rather
    // than after the caller's first assertion.
    await Promise.resolve()
  })
}


describe('ExportsDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    doesFileExistInOPFS.mockResolvedValue(true)
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    // Default: nothing to hydrate from, so each test's `loadExports` is what
    // the list shows. The hydration tests below override it.
    hydrateExports.mockImplementation((_sub, _serverExports) => loadExports())
    useStore.getState().setAppMetadata({})
  })

  afterAll(() => {
    useStore.getState().setAppMetadata({})
  })

  it('explains the feature when nothing has been exported', async () => {
    loadExports.mockResolvedValue({exports: []})

    await renderDialog()

    expect(await screen.findByTestId('exports-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('exports-row')).not.toBeInTheDocument()
  })

  it('lists an export with its format, size and source path', async () => {
    loadExports.mockResolvedValue({exports: [aRow()]})

    await renderDialog()

    const row = await screen.findByTestId('exports-row')
    expect(row).toHaveTextContent('index.ifc')
    expect(row).toHaveTextContent('GLB')
    expect(row).toHaveTextContent('2048 B')
    expect(row).toHaveTextContent('/share/v/p/index.ifc')
    expect(await screen.findByTestId('exports-download-again')).toBeInTheDocument()
  })

  it('falls back to the share path\'s basename when a row has no title', async () => {
    loadExports.mockResolvedValue({exports: [aRow({title: null, key: '/share/v/p/nested/model.step'})]})

    await renderDialog()

    expect(await screen.findByTestId('exports-row')).toHaveTextContent('model.step')
  })

  it('offers regeneration instead of re-download when the artifact is gone', async () => {
    // Cleared cache / storage pressure: the row survives, the bytes don't.
    loadExports.mockResolvedValue({exports: [aRow()]})
    doesFileExistInOPFS.mockResolvedValue(false)

    await renderDialog()

    await screen.findByTestId('exports-row')
    await waitFor(() => expect(screen.getByText(/Open the model to regenerate/)).toBeInTheDocument())
    expect(screen.queryByTestId('exports-download-again')).not.toBeInTheDocument()
  })

  it('offers regeneration for a row synced from another device', async () => {
    // No cacheKeyArgs: those never leave the browser that made the export, so
    // there is no cache key to look up and OPFS is never even consulted.
    loadExports.mockResolvedValue({exports: [aRow({cacheKeyArgs: null, schemaVer: null})]})

    await renderDialog()

    await screen.findByTestId('exports-row')
    await waitFor(() => expect(screen.getByText(/Open the model to regenerate/)).toBeInTheDocument())
    expect(doesFileExistInOPFS).not.toHaveBeenCalled()
  })

  it('reads nothing while closed', async () => {
    loadExports.mockResolvedValue({exports: [aRow()]})

    await renderDialog(false)

    expect(loadExports).not.toHaveBeenCalled()
  })

  it('reads the signed-in account\'s mirror, not a shared one', async () => {
    // OPFS is per-origin, so the sub is the only thing separating one Auth0
    // account's history from the next one's on this browser (§4.5).
    loadExports.mockResolvedValue({exports: []})

    await renderDialog()

    expect(loadExports).toHaveBeenCalledWith(SUB)
  })

  it('re-downloads with the options that export ran with', async () => {
    // A row exported with the metadata stripped must come back stripped —
    // re-running with `{}` would hand back a different, larger file.
    loadExports.mockResolvedValue({exports: [aRow()]})

    await renderDialog()

    fireEvent.click(await screen.findByTestId('exports-download-again'))
    expect(mockRun).toHaveBeenCalledWith(
      'glb',
      {stripBldrsMetadata: true},
      expect.objectContaining({cacheKeyArgs: CACHE_KEY_ARGS, key: '/share/v/p/index.ifc'}),
    )
  })

  it('hydrates the empty mirror from the account\'s server history', async () => {
    // A new device (or a cleared cache) has no local rows at all, but the
    // account's history rode in on the JWT claim BaseRoutes decoded.
    const serverRows = [
      aRow({id: 'server-1', cacheKeyArgs: null, schemaVer: null, options: null}),
      aRow({id: 'server-2', key: '/share/v/p/other.ifc', cacheKeyArgs: null, schemaVer: null, options: null}),
    ]
    loadExports.mockResolvedValue({exports: []})
    useStore.getState().setAppMetadata({subscriptionStatus: 'sharePro', exports: serverRows})
    hydrateExports.mockResolvedValue({exports: serverRows})

    await renderDialog()

    await waitFor(() => expect(screen.getAllByTestId('exports-row')).toHaveLength(2))
    expect(hydrateExports).toHaveBeenCalledWith(SUB, serverRows)
  })
})
