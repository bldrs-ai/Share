import React, {ReactElement, useCallback, useEffect, useState} from 'react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import {Box, Button, Chip, Link, Stack, Typography} from '@mui/material'
import {useNavigate} from 'react-router-dom'
import {glbCacheKey} from '../../loader/glbCacheKey'
import {doesFileExistInOPFS} from '../../OPFS/utils'
import {getExportFormat} from '../../export/exportRegistry'
import {loadExports, subscribeToExports} from '../../export/exportHistory'
import useExport, {formatBytes} from '../../export/useExport'
import {navigateToModel} from '../../utils/navigate'
import Dialog from '../Dialog'
import {FileDownloadOutlined as FileDownloadIcon} from '@mui/icons-material'


// dayjs ships `fromNow` as an opt-in plugin; without this every relative
// date renders as the literal string "Invalid Date"'s cousin — a thrown
// "fromNow is not a function". Extending at module scope is idempotent.
dayjs.extend(relativeTime)


/**
 * "My Exports": what this user has exported, newest first, with a
 * re-download for the ones whose artifact is still in this browser's cache.
 *
 * The list is read from the OPFS mirror (`src/export/exportHistory.js`), not
 * from the server, so it paints instantly and still works offline; the mirror
 * is refreshed from `record-export`'s response after every export, and this
 * dialog subscribes so an export made while it is open appears without a
 * reopen.
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
 * @property {boolean} isDialogDisplayed Whether the dialog is open
 * @property {Function} setIsDialogDisplayed Open/close setter
 * @return {ReactElement}
 */
export default function ExportsDialog({isDialogDisplayed, setIsDialogDisplayed}) {
  const [entries, setEntries] = useState([])
  const [redownloadableIds, setRedownloadableIds] = useState([])

  const {isExporting, run} = useExport()
  const navigate = useNavigate()

  // Only mirror state while the dialog is open: an unopened dialog that
  // subscribed would keep setting state behind a closed UI, which is the
  // shape that fills consumers' tests with act() warnings.
  useEffect(() => {
    if (!isDialogDisplayed) {
      return undefined
    }
    let isCancelled = false
    loadExports().then(({exports}) => {
      if (!isCancelled) {
        setEntries(exports)
      }
    })
    const unsubscribe = subscribeToExports(({exports}) => {
      if (!isCancelled) {
        setEntries(exports)
      }
    })
    return () => {
      isCancelled = true
      unsubscribe()
    }
  }, [isDialogDisplayed])

  useEffect(() => {
    if (!isDialogDisplayed) {
      return undefined
    }
    let isCancelled = false
    findRedownloadableIds(entries).then((ids) => {
      if (!isCancelled) {
        setRedownloadableIds(ids)
      }
    })
    return () => {
      isCancelled = true
    }
  }, [entries, isDialogDisplayed])

  const onOpenModel = useCallback((key) => {
    setIsDialogDisplayed(false)
    navigateToModel(key, navigate)
  }, [navigate, setIsDialogDisplayed])

  const onDownloadAgain = useCallback((entry) => {
    // The recorded artifact, not whatever model is on screen — this dialog
    // is reachable from anywhere.
    run(entry.format, {}, {
      cacheKeyArgs: entry.cacheKeyArgs,
      schemaVer: entry.schemaVer,
      key: entry.key,
    })
  }, [run])

  return (
    <Dialog
      headerIcon={<FileDownloadIcon/>}
      headerText='My Exports'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
    >
      <Stack spacing={1} data-testid='exports-dialog'>
        {entries.length === 0 ?
          <Stack spacing={1} data-testid='exports-empty'>
            <Typography variant='body2'>
              Models you download are listed here — what you exported, when, and how big.
            </Typography>
            <Typography variant='body2' color='text.secondary'>
              Start an export from the Export section of the Share dialog.
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
    </Dialog>
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
