import React from 'react'
import {act, render, screen, waitFor} from '@testing-library/react'
import {doesFileExistInOPFS} from '../../OPFS/utils'
import {RouteThemeCtx} from '../../Share.fixture'
import {loadExports} from '../../export/exportHistory'
import ExportsDialog from './ExportsDialog'


jest.mock('../../OPFS/utils', () => ({doesFileExistInOPFS: jest.fn()}))
jest.mock('../../export/exportHistory', () => ({
  loadExports: jest.fn(),
  subscribeToExports: jest.fn(() => () => {}),
}))
// The hook has its own suite; the dialog only needs `run` to exist.
jest.mock('../../export/useExport', () => ({
  __esModule: true,
  default: () => ({run: jest.fn(), isExporting: false, error: null}),
  formatBytes: (bytes) => `${bytes} B`,
}))


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
})
