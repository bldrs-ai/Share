import React, {ReactElement, useCallback, useEffect, useState} from 'react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import {Box, Button, Chip, Link, Stack, Typography} from '@mui/material'
import {useNavigate} from 'react-router-dom'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {glbCacheKey} from '../../loader/glbCacheKey'
import {doesFileExistInOPFS} from '../../OPFS/utils'
import {getExportFormat} from '../../export/exportRegistry'
import {hydrateExports, loadExports, subscribeToExports} from '../../export/exportHistory'
import useExport, {formatBytes} from '../../export/useExport'
import useStore from '../../store/useStore'
import {navigateToModel} from '../../utils/navigate'


// dayjs ships `fromNow` as an opt-in plugin; without this every relative
// date renders as the literal string "Invalid Date"'s cousin — a thrown
// "fromNow is not a function". Extending at module scope is idempotent.
dayjs.extend(relativeTime)


/**
 * "My Exports": what this user has exported, newest first, with a
 * re-download for the ones whose artifact is still in this browser's cache.
 *
 * NOT MOUNTED ANYWHERE TODAY. It rendered inside the Save dialog's Export
 * tab, under `ExportSection`, until the owner took the history back off that
 * panel (#1838) — kept, with its own suite, because the recording pipeline it
 * reads (`recordExport`, the OPFS mirror, the claim hydration) is still live
 * and still writing the rows this would show. Design: §4.5, dormant rather
 * than dropped.
 *
 * A plain list, not a dialog. Mounting IS the "open" signal: a host tab
 * unmounts it when the user switches away and the dialog unmounts it when
 * closed, so the subscription below is alive exactly while the list is on
 * screen.
 *
 * The list is read from the OPFS mirror (`src/export/exportHistory.js`), not
 * from the server, so it paints instantly and still works offline; the mirror
 * is refreshed from `record-export`'s response after every export, and this
 * list subscribes so an export made while it is open appears without a
 * reopen. The mirror is per-account, so everything here is addressed by the
 * signed-in `sub` and a signed-out list is empty by construction.
 *
 * A mirror that has never seen this account is not the same as an account
 * with no history: on a new device, or after the local cache was cleared, the
 * rows live on in Auth0 `app_metadata.exports` (the claim `BaseRoutes.jsx`
 * decodes into `store.appMetadata`). Mounting the list hydrates the mirror
 * from that list — see `hydrateExports`.
 *
 * "Download again" is only offered for a row that carries `cacheKeyArgs` +
 * `schemaVer` AND whose artifact is still on disk. Both halves are needed:
 * those two fields never leave this browser (the server's row has only the
 * share path, which cannot be turned back into a cache key — §4.5), so a row
 * synced from another device can never re-download here, and a row whose
 * artifact was evicted (Clear Local Cache, storage pressure) would fail at
 * the OPFS read. Those rows say to open the model instead, which rewrites the
 * artifact.
 *
 * Design: design/new/glb-export-premium.md §4.5.
 *
 * @property {Function} [onNavigate] Called before navigating away from the
 *   model on screen, so a host dialog can close itself
 * @return {ReactElement}
 */
export default function ExportsList({onNavigate}) {
  const [entries, setEntries] = useState([])
  const [redownloadableIds, setRedownloadableIds] = useState([])

  const appMetadata = useStore((state) => state.appMetadata)
  const {user} = useAuth0()
  const sub = user?.sub || null
  // Tab-wide (store/UISlice.js): every row's action and the Download GLB
  // button above share it, so only one export runs at a time (#1834).
  const {isExporting, run} = useExport()
  const navigate = useNavigate()

  useEffect(() => {
    let isCancelled = false
    loadExports(sub).then(({exports}) => {
      if (!isCancelled) {
        setEntries(exports)
      }
    })
    const unsubscribe = subscribeToExports(sub, ({exports}) => {
      if (!isCancelled) {
        setEntries(exports)
      }
    })
    return () => {
      isCancelled = true
      unsubscribe()
    }
  }, [sub])

  // Catch-up from the account's server-side history, which the local mirror
  // may know nothing about (new device, cleared cache). Runs alongside the
  // read above rather than in place of it: OPFS answers immediately and this
  // lands whenever it lands, publishing through the same subscription.
  useEffect(() => {
    if (!sub) {
      return undefined
    }
    let isCancelled = false
    hydrateExports(sub, appMetadata?.exports).then(({exports}) => {
      if (!isCancelled) {
        setEntries(exports)
      }
    })
    return () => {
      isCancelled = true
    }
  }, [sub, appMetadata])

  useEffect(() => {
    let isCancelled = false
    findRedownloadableIds(entries).then((ids) => {
      if (!isCancelled) {
        setRedownloadableIds(ids)
      }
    })
    return () => {
      isCancelled = true
    }
  }, [entries])

  const onOpenModel = useCallback((key) => {
    if (onNavigate) {
      onNavigate()
    }
    navigateToModel(key, navigate)
  }, [navigate, onNavigate])

  const onDownloadAgain = useCallback((entry) => {
    // The recorded artifact, not whatever model is on screen — this dialog
    // is reachable from anywhere. And the options that export RAN with, so
    // this hands back the same file: re-running a stripped export with the
    // defaults would produce a bigger one carrying every BLDRS_* payload.
    run(entry.format, entry.options || {}, {
      cacheKeyArgs: entry.cacheKeyArgs,
      schemaVer: entry.schemaVer,
      key: entry.key,
    })
  }, [run])

  return (
    <Stack spacing={1} data-testid='exports-list' sx={{mt: 2}}>
      <Typography variant='overline'>My Exports</Typography>
      {entries.length === 0 ?
        <Stack spacing={1} data-testid='exports-empty'>
          <Typography variant='body2'>
            Models you download are listed here — what you exported, when, and how big.
          </Typography>
          <Typography variant='body2' color='text.secondary'>
            Start an export with the Export GLB button above.
          </Typography>
        </Stack> :
        entries.map((entry) => (
          <ExportRow
            key={entry.id}
            entry={entry}
            isRedownloadable={redownloadableIds.includes(entry.id)}
            isExporting={isExporting}
            onOpenModel={onOpenModel}
            onDownloadAgain={onDownloadAgain}
          />
        ))}
    </Stack>
  )
}


/**
 * One export.
 *
 * @property {object} entry Row from the history mirror
 * @property {boolean} isRedownloadable Artifact still readable from OPFS
 * @property {boolean} isExporting An export is already running
 * @property {Function} onOpenModel Called with the row's share path
 * @property {Function} onDownloadAgain Called with the row
 * @return {ReactElement}
 */
function ExportRow({entry, isRedownloadable, isExporting, onOpenModel, onDownloadAgain}) {
  const format = getExportFormat(entry.format)
  return (
    <Stack
      direction='row'
      justifyContent='space-between'
      alignItems='center'
      // Wraps rather than overflowing: at 390px the metadata line and the
      // action don't fit on one row.
      flexWrap='wrap'
      gap={1}
      data-testid='exports-row'
      sx={{borderTop: '1px solid', borderColor: 'divider', pt: 1}}
    >
      <Box sx={{minWidth: 0, flex: '1 1 12em'}}>
        <Typography variant='body1' noWrap>{entry.title || basename(entry.key)}</Typography>
        <Stack direction='row' alignItems='center' flexWrap='wrap' gap={1}>
          <Chip label={format ? format.label : entry.format.toUpperCase()} size='small'/>
          <Typography variant='caption' color='text.secondary'>{formatBytes(entry.bytes)}</Typography>
          <Typography variant='caption' color='text.secondary'>{dayjs(entry.exportedAt).fromNow()}</Typography>
        </Stack>
        <Link
          component='button'
          variant='caption'
          onClick={() => onOpenModel(entry.key)}
          sx={{display: 'block', maxWidth: '100%', overflowWrap: 'anywhere', textAlign: 'left'}}
        >
          {entry.key}
        </Link>
      </Box>
      {isRedownloadable ?
        <Button
          variant='outlined'
          size='small'
          disabled={isExporting}
          onClick={() => onDownloadAgain(entry)}
          data-testid='exports-download-again'
        >
          Download again
        </Button> :
        <Typography variant='caption' color='text.secondary'>Open the model to regenerate</Typography>}
    </Stack>
  )
}


/**
 * Which rows can be re-downloaded from this browser's cache right now.
 *
 * @param {Array<object>} entries History rows
 * @return {Promise<Array<string>>} ids of rows whose artifact is in OPFS
 */
async function findRedownloadableIds(entries) {
  const checked = await Promise.all(entries.map(async (entry) => {
    if (!entry.cacheKeyArgs || !entry.schemaVer) {
      return null
    }
    try {
      const key = glbCacheKey({...entry.cacheKeyArgs, schemaVer: entry.schemaVer})
      const exists = await doesFileExistInOPFS(
        key.originalFilePath, key.commitHash, key.owner, key.repo, key.branch)
      return exists ? entry.id : null
    } catch {
      // A malformed row (hand-edited exports.json, a cache-key shape from a
      // future version) offers the regenerate path rather than a broken button.
      return null
    }
  }))
  return checked.filter((id) => id !== null)
}


/**
 * @param {string} path e.g. '/share/v/p/index.ifc'
 * @return {string} e.g. 'index.ifc'
 */
function basename(path) {
  return String(path || '').split('/').pop()
}
