import {useCallback, useState} from 'react'
import {captureException} from '@sentry/react'
import {useAuth0} from '../Auth0/Auth0Proxy'
import {glbCacheKey} from '../loader/glbCacheKey'
import {HTTP_AUTHORIZATION_REQUIRED, HTTP_FORBIDDEN} from '../net/http'
import {readModelByPathFromOPFS} from '../OPFS/utils'
import {gtagEvent} from '../privacy/analytics'
import useStore from '../store/useStore'
import {triggerDownload} from './download'
import {recordExport} from './exportHistory'
import {getExportFormat} from './exportRegistry'
import {ProModuleDeniedError, loadProModule} from './proModuleLoader'


// The Auth0 audience/scope every token call site in the app uses; kept
// identical here so the export shares the same cached token rather than
// forcing a second, differently-scoped one (see ProfileControl, useQuota).
const TOKEN_PARAMS = {
  authorizationParams: {
    audience: 'https://api.github.com/',
    scope: 'openid profile email offline_access',
  },
}

const BYTES_PER_KB = 1024
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB
const MB_PER_GB = BYTES_PER_KB
const SIZE_DECIMALS = 1


/**
 * Run an export end to end: locate the cached artifact, load the premium
 * module that knows the format, convert, download.
 *
 * The steps are ordered so nothing premium is fetched speculatively — the
 * module request only happens once there are real bytes to hand it, which
 * also keeps the server's denial rate meaningful (§4.6: a 403 spike means a
 * stale client badge or a probe, not idle UI).
 *
 * `run(formatId, options, source)` normally exports the CURRENTLY loaded
 * model, from the `glbArtifact` slot the loader publishes. `source` overrides
 * that with an artifact identified elsewhere — "Download again" in
 * `ExportsList`, which holds the `{cacheKeyArgs, schemaVer}` of a model that
 * may not be the one on screen (§4.5).
 *
 * Design: design/new/glb-export-premium.md §4.4.
 *
 * @return {{run: Function, isExporting: boolean, error: ?Error}}
 */
export default function useExport() {
  const glbArtifact = useStore((state) => state.glbArtifact)
  const setSnackMessage = useStore((state) => state.setSnackMessage)
  const {getAccessTokenSilently, user} = useAuth0()
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState(null)

  const run = useCallback(async (formatId, options = {}, source = null) => {
    const format = getExportFormat(formatId)
    if (!format || format.status !== 'shipped') {
      throw new Error(`useExport: no shipped export format "${formatId}"`)
    }
    const artifact = source || glbArtifact
    if (!artifact) {
      // The button is disabled in this state; reaching here means the
      // artifact went away between render and click.
      setSnackMessage({text: 'The model is still being prepared for export', autoDismiss: true})
      return null
    }

    setIsExporting(true)
    setError(null)
    try {
      const {cacheKeyArgs, schemaVer} = artifact
      const key = glbCacheKey({...cacheKeyArgs, schemaVer})
      const file = await readModelByPathFromOPFS(
        key.originalFilePath, key.commitHash, key.owner, key.repo, key.branch)
      if (!file) {
        // The artifact was evicted (Clear Local Cache, storage pressure)
        // since the loader published it. Reopening the model rewrites it.
        setSnackMessage({text: 'Export unavailable — reload the model and try again', autoDismiss: true})
        return null
      }

      const proModule = await loadProModule(format.moduleName, () => getAccessTokenSilently(TOKEN_PARAMS))
      const bytes = new Uint8Array(await file.arrayBuffer())
      const {blob, filename, stats} = await proModule.exportArtifact({
        bytes,
        // The store's `model.name` is a composed DISPLAY label ("Scene
        // (index.glb)") rather than a filename, so the artifact's own source
        // path is what the download is named after. The module still honours
        // an explicit `title` for callers that have a real one.
        options: {sourceBasename: basename(cacheKeyArgs.sourcePath), ...options},
      })

      triggerDownload(blob, filename)
      setSnackMessage({text: `Exported ${filename} (${formatBytes(blob.size)})`, autoDismiss: true})
      // Deliberately NOT awaited: the file is already in the user's
      // Downloads, so the snackbar must not wait on OPFS, Auth0 and a
      // Netlify round trip — and a failure in any of them must not turn a
      // completed export into an error. `recordExport` writes its local row
      // first and never rejects; see exportHistory.js.
      recordExport(
        {
          // The share path, the same key shape record-load counts loads
          // under. The cache-key fields beside it stay in this browser
          // (exportHistory.js) — they are what "Download again" needs and
          // what the server has no use for. A re-download carries the key of
          // the model it recorded, which is not necessarily the one on screen.
          key: source?.key || window.location.pathname,
          format: format.id,
          bytes: blob.size,
          title: basename(cacheKeyArgs.sourcePath),
          cacheKeyArgs,
          schemaVer,
          // The options this run USED, so "Download again" reproduces this
          // file. Without them a row exported with the metadata stripped
          // re-downloads with every BLDRS_* payload back in it — a bigger,
          // more sensitive file than the size beside the row claims.
          options,
        },
        user?.sub,
        () => getAccessTokenSilently(TOKEN_PARAMS),
        () => getAccessTokenSilently({...TOKEN_PARAMS, cacheMode: 'off', useRefreshTokens: true}),
      ).then((recordResult) => {
        if (recordResult.status === HTTP_AUTHORIZATION_REQUIRED || recordResult.status === HTTP_FORBIDDEN) {
          // `pro-module` already said yes to this user moments ago, so a
          // denial HERE means the two gates disagree — worth seeing.
          captureException(new Error(`record-export refused the export (${recordResult.status})`))
        }
      }).catch((recordError) => captureException(recordError))
      gtagEvent('export_model', {
        format: format.id,
        bytes_bucket: bytesBucket(stats?.outputBytes ?? blob.size),
        source_kind: cacheKeyArgs.ns1,
      })
      return {filename, stats}
    } catch (e) {
      setError(e)
      if (e instanceof ProModuleDeniedError) {
        // The server is the authority and it said no, so the badge that let
        // this click through is stale. Force-refresh the JWT the way
        // useQuota does after a server-side quota decision, so every
        // app_metadata reader (BaseRoutes, the Profile menu) catches up.
        setSnackMessage({text: 'Export requires a Pro subscription', autoDismiss: true})
        getAccessTokenSilently({...TOKEN_PARAMS, cacheMode: 'off', useRefreshTokens: true})
          .catch((refreshError) => captureException(refreshError))
      } else {
        captureException(e)
        setSnackMessage({text: 'Export failed', autoDismiss: true})
      }
      return null
    } finally {
      setIsExporting(false)
    }
  }, [glbArtifact, getAccessTokenSilently, setSnackMessage, user?.sub])

  return {run, isExporting, error}
}


/**
 * @param {string} path e.g. 'ifc/misc/box.ifc'
 * @return {string} e.g. 'box.ifc'
 */
function basename(path) {
  return String(path || '').split('/').pop()
}


/**
 * Human size for the success snackbar. KB below a megabyte, so a small
 * model doesn't report "0.0 MB".
 *
 * @param {number} bytes
 * @return {string} e.g. '12.4 MB'
 */
export function formatBytes(bytes) {
  const kb = bytes / BYTES_PER_KB
  if (kb < BYTES_PER_KB) {
    return `${kb.toFixed(SIZE_DECIMALS)} KB`
  }
  const mb = bytes / BYTES_PER_MB
  return mb >= MB_PER_GB ?
    `${(mb / MB_PER_GB).toFixed(SIZE_DECIMALS)} GB` :
    `${mb.toFixed(SIZE_DECIMALS)} MB`
}


/**
 * Coarse size bucket for analytics. Buckets, not the raw size, because the
 * funnel question is "do big models export" — and a byte count on a
 * per-export event is closer to identifying a specific model than we want
 * in GA.
 *
 * @param {number} bytes
 * @return {string} one of '<1MB', '1-10MB', '10-100MB', '>100MB'
 */
export function bytesBucket(bytes) {
  const mb = bytes / BYTES_PER_MB
  const TEN_MB = 10
  const HUNDRED_MB = 100
  if (mb < 1) {
    return '<1MB'
  }
  if (mb < TEN_MB) {
    return '1-10MB'
  }
  if (mb < HUNDRED_MB) {
    return '10-100MB'
  }
  return '>100MB'
}
