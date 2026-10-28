import {useCallback, useRef, useState} from 'react'
import {captureException} from '@sentry/react'
import {useAuth0} from '../Auth0/Auth0Proxy'
import {appMetadataFromToken} from '../Auth0/appMetadata'
import {glbCacheKey} from '../loader/glbCacheKey'
import {HTTP_AUTHORIZATION_REQUIRED, HTTP_FORBIDDEN} from '../net/http'
import {readModelByPathFromOPFS} from '../OPFS/utils'
import {
  GATE_EVENTS,
  MODEL_ACTIONS,
  MODEL_GATES,
  gtagEventWithCid,
  modelRouteSource,
} from '../privacy/analytics'
import {trackModelActionWhenAuthSettled} from '../privacy/modelActionTracking'
import {modelSlotKey} from '../quota/modelSlotKey'
import {TIERS, getTier} from '../quota/quota'
import useStore from '../store/useStore'
import {compressedExport, gzippedExport} from './artifactSizes'
import {triggerDownload} from './download'
import {recordExport} from './exportHistory'
import {QUALITY_DEFAULT, isQualityLevel} from './exportQuality'
import {getExportFormat} from './exportRegistry'
import {EXPORT_SLOT_MISSING_REASON, NO_FREE_SLOT_REASON, formatNextFreeSlot} from './exportSlots'
import {COMPRESSION_NONE, isCompressionMode} from './glbCompression'
import {isGzipAvailable} from './glbGzip'
import {ProModuleDeniedError, forgetProModule, loadProModule} from './proModuleLoader'


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
 * `isExporting` is shared across every caller in the tab (it lives in
 * `store/UISlice.js`), because the two components that export — the Download
 * GLB button and each "Download again" row — must disable each other: two
 * concurrent runs would race the history mirror's read-modify-write and hand
 * the user two downloads for one click each (§4.4).
 *
 * `run(formatId, options, source)` normally exports the CURRENTLY loaded
 * model, from the `glbArtifact` slot the loader publishes. `source` overrides
 * that with an artifact identified elsewhere — "Download again" in
 * `ExportsList`, which holds the `{cacheKeyArgs, schemaVer}` of a model that
 * may not be the one on screen (§4.5).
 *
 * A FREE user's export is decided by MODEL SLOTS (§4.8,
 * src/export/exportSlots.js): the run names the model by its slot key
 * (`quota/modelSlotKey.js`, from the route as it was when the run started), `pro-module` hands over
 * the module only if that key holds one of the user's slots or a free slot
 * can be taken for it, and `record-export` records the export under the same
 * key. Every statement of the slots the server makes on the way — the
 * delivery's header, the record response, a slots-full refusal — goes into
 * the store slot the Export tab's slot line reads (`useExportSlots`).
 *
 * Design: design/new/glb-export-premium.md §4.4, §4.8.
 *
 * @return {{run: Function, isExporting: boolean, error: ?Error}}
 */
export default function useExport() {
  const glbArtifact = useStore((state) => state.glbArtifact)
  const setAppMetadata = useStore((state) => state.setAppMetadata)
  const setSnackMessage = useStore((state) => state.setSnackMessage)
  const setModelSlots = useStore((state) => state.setModelSlots)
  const {getAccessTokenSilently, isAuthenticated, user} = useAuth0()
  // The latest auth state, for model_export's tier, which is read once auth
  // settles rather than when the run's closure was made (reportModelExport).
  const isAuthenticatedRef = useRef(isAuthenticated)
  isAuthenticatedRef.current = isAuthenticated
  // In the STORE, not in this hook: `ExportSection` and `ExportsList` each
  // call `useExport`, so per-instance state let one of them start an export
  // while the other's was still running (#1834).
  const isExporting = useStore((state) => state.isExportInFlight)
  const setIsExporting = useStore((state) => state.setIsExportInFlight)
  const [error, setError] = useState(null)

  // Force-refresh the JWT and APPLY what comes back. `useQuota` fires the
  // same refresh after a server-side quota decision and throws the token
  // away, which is enough there because the badge it feeds is already
  // authoritative. Here it is not: `record-export` has just appended a row
  // to Auth0 `app_metadata.exports`, and the refresh only updates Auth0's
  // token cache — `store.appMetadata` keeps the PRE-export claim until the
  // page reloads. Reopening the Export tab then hydrates the mirror from
  // that stale list and the export the user just made disappears from
  // "My Exports" (#1834). Decoded through the same claim `BaseRoutes` reads
  // (Auth0/appMetadata.js); a token that carries no claim leaves the store
  // alone rather than clearing it.
  const refreshAppMetadata = useCallback(async () => {
    const token = await getAccessTokenSilently(
      {...TOKEN_PARAMS, cacheMode: 'off', useRefreshTokens: true})
    const appData = appMetadataFromToken(token)
    if (appData) {
      setAppMetadata(appData)
    }
    return token
  }, [getAccessTokenSilently, setAppMetadata])

  // The slots as the server last stated them, for this account only. A
  // delivery's header carries counts but no keys (a header must stay ASCII,
  // exportSlots.js#slotsHeaderValue), so `heldKey` — the model it was just
  // granted for — is added to the keys already known; a body (record-export,
  // a refusal) carries the full list and replaces them.
  const noteSlots = useCallback((slots, heldKey = null) => {
    if (!slots || !user?.sub) {
      return
    }
    const previous = useStore.getState().modelSlots
    let keys = []
    if (Array.isArray(slots.keys)) {
      keys = slots.keys
    } else if (previous?.sub === user.sub && Array.isArray(previous.keys)) {
      keys = previous.keys
    }
    if (heldKey && !keys.includes(heldKey)) {
      keys = [...keys, heldKey]
    }
    const {limit, used, remaining, nextFreeAt} = slots
    setModelSlots({sub: user.sub, limit, used, remaining, nextFreeAt: nextFreeAt ?? null, keys})
  }, [setModelSlots, user?.sub])

  const run = useCallback(async (formatId, options = {}, source = null) => {
    const format = getExportFormat(formatId)
    if (!format || format.status !== 'shipped') {
      throw new Error(`useExport: no shipped export format "${formatId}"`)
    }
    // One `export_failed` per run that doesn't deliver a file, whichever way
    // it fails (codex review on Share#1968), beside export_model's one per
    // delivered file.
    const artifact = source || glbArtifact
    // The model this run exports, named by the key its slot is held under
    // (quota/modelSlotKey.js) — the same string for `pro-module` and
    // `record-export`, so the export is decided and recorded as one model.
    // The route is snapshotted NOW, not after the module load: navigation
    // isn't locked meanwhile. The key itself resolves in the try below (a
    // URL model's is a digest, which is async). A "Download again" row
    // carries the key it was recorded under, which may be another model.
    const {modelPath: runModelPath, appPrefix: runAppPrefix} = useStore.getState()
    // The normalized twin of export_model / export_failed{no_slot}
    // (design/new/quotas.md §"Analytics: normalized tier events"). Source is
    // the model on screen, snapshotted NOW: the event goes out after the
    // module load, the conversion and the history write, and navigation
    // isn't locked meanwhile, so reading the route then could credit the
    // export to the next model (codex review on Share#1976). A "Download
    // again" of a history row (`source` passed) may be another model, so it
    // sends no source rather than a wrong one.
    const exportSource = source ? {} : modelRouteSource(useStore.getState().modelPath)
    // The tier, unless the caller fixes it, is read when auth has settled
    // (privacy/modelActionTracking.js): Auth0 says signed in before
    // BaseRoutes has written the claims, so an export delivered in that
    // window would read a Pro user's still-empty claims as free. A fixed
    // tier (no_slot) sends at once.
    const reportModelExport = (gate, tier) => trackModelActionWhenAuthSettled(MODEL_ACTIONS.EXPORT, {
      gate,
      ...exportSource,
      tier,
      getIsAuthenticated: () => isAuthenticatedRef.current,
    })
    const reportFailure = (reason) => {
      gtagEventWithCid(GATE_EVENTS.EXPORT_FAILED, {format: format.id, reason})
      // Only the no-free-slot refusal is a gate: model_export {blocked}
      // means "refused: no free model slot" since the slot rule
      // (glb-export-premium.md §4.8). `denied`, `unavailable` and `error`
      // are failures, not gate verdicts, and send no model_export. That
      // refusal is free-tier by definition, whatever the local claim says:
      // a stale-Pro JWT on a canceled account (handled below) must not land
      // in the blocked × pro cell (codex review on Share#1976).
      if (reason === NO_SLOT_FAILURE_REASON) {
        reportModelExport(MODEL_GATES.BLOCKED, TIERS.FREE)
      }
    }
    if (!artifact) {
      // The button is disabled in this state; reaching here means the
      // artifact went away between render and click.
      setSnackMessage({text: 'The model is still being prepared for export', autoDismiss: true})
      reportFailure(EXPORT_UNAVAILABLE_REASON)
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
        reportFailure(EXPORT_UNAVAILABLE_REASON)
        return null
      }

      // `slots` is non-null for a free-tier delivery, which the server made
      // because `modelKey` holds one of the user's slots — or now does,
      // `slots.taken` (§4.8). The loader has already declined to memoise it;
      // what is left here is to show the new slots.
      // The pathname fallback is for a model with no parsed route, which the
      // server then treats as a model of its own.
      const modelKey = source?.key ||
        (await modelSlotKey(runModelPath, runAppPrefix)) ||
        window.location.pathname
      const {namespace: proModule, slots} =
        await loadProModule(format.moduleName, () => getAccessTokenSilently(TOKEN_PARAMS), modelKey)
      noteSlots(slots, modelKey)
      const bytes = new Uint8Array(await file.arrayBuffer())
      const {blob, filename, stats} = await proModule.exportArtifact({
        bytes,
        // The store's `model.name` is a composed DISPLAY label ("Scene
        // (index.glb)") rather than a filename, so the artifact's own source
        // path is what the download is named after. The module still honours
        // an explicit `title` for callers that have a real one.
        options: {sourceBasename: basename(cacheKeyArgs.sourcePath), ...options},
        compress: compressHookFor(artifact, options),
      })

      triggerDownload(blob, filename)
      setSnackMessage({text: `Exported ${filename} (${formatBytes(blob.size)})`, autoDismiss: true})
      // Awaited AFTER the snackbar, so the success message never waits on
      // OPFS, Auth0 and a Netlify round trip — but before the in-flight
      // flag clears in `finally`, because that flag exists to serialise the
      // history mirror's read-modify-write: releasing it while this record
      // was still pending let a second export race it and lose a row
      // (#1837 round 3). A failure here must not turn a completed export
      // into an error; `recordExport` writes its local row first and never
      // rejects (exportHistory.js), and the catch below is belt and braces.
      await recordExport(
        {
          // The slot key `pro-module` was sent: for a free user,
          // `record-export` refuses an export of a model holding no slot.
          // The cache-key fields beside it stay in this browser
          // (exportHistory.js) — they are what "Download again" needs and
          // what the server has no use for.
          key: modelKey,
          format: format.id,
          bytes: blob.size,
          title: basename(cacheKeyArgs.sourcePath),
          cacheKeyArgs,
          schemaVer,
          // The options this run USED, so "Download again" reproduces this
          // file. Without them a row exported with the metadata stripped
          // re-downloads with every BLDRS_* payload back in it — a bigger,
          // more sensitive file than the size beside the row claims. The
          // codec is the one the module reports it APPLIED: when an encoder
          // was unavailable the file is uncompressed, and a row saying
          // "draco" beside its size would describe a file that was never
          // made.
          // Both fallbacks are folded in for the same reason: the row has to
          // describe the file that landed. A codec whose encoder was
          // unavailable produced an uncompressed file, and a gzip this
          // browser could not do produced a plain `.glb` — replaying either
          // option as ASKED would re-download something the row's own size
          // does not describe.
          options: stats?.compression ?
            {...options, compression: stats.compression, gzip: Boolean(stats.gzip)} :
            options,
        },
        user?.sub,
        () => getAccessTokenSilently(TOKEN_PARAMS),
        refreshAppMetadata,
      ).then((recordResult) => {
        noteSlots(recordResult.modelSlots)
        if (recordResult.status === HTTP_AUTHORIZATION_REQUIRED || recordResult.status === HTTP_FORBIDDEN) {
          // `pro-module` already said yes to this user moments ago, so a
          // denial HERE means the two gates disagree — worth seeing.
          captureException(new Error(`record-export refused the export (${recordResult.status})`))
          if (!slots && recordResult.reason === EXPORT_SLOT_MISSING_REASON) {
            // A delivery with no slots header is the loader's memoised Pro
            // module, and the server just refused its export as a free
            // user's export of a model holding no slot: the account lost Pro
            // while this page stayed open. Without this every later export
            // would reuse the memo and skip `pro-module`'s slot check for
            // the rest of the session. Forget it so the next export is
            // decided afresh, and refresh the claims so the UI gates the
            // button now rather than after a reload. Only on this 403: a 401
            // also comes from a token that expired mid-export or an Auth0
            // outage, on an account that may still be Pro, and evicting then
            // would make every export wait on `pro-module` for the length of
            // the outage.
            forgetProModule(format.moduleName)
            refreshAppMetadata().catch((refreshError) => captureException(refreshError))
          }
        }
      }).catch((recordError) => captureException(recordError))
      gtagEventWithCid(GATE_EVENTS.EXPORT_MODEL, {
        format: format.id,
        bytes_bucket: bytesBucket(stats?.outputBytes ?? blob.size),
        // The loader's categorical kind, carried on the artifact slot. NOT
        // `cacheKeyArgs.ns1`, which reads like the same thing and is a repo
        // OWNER for GitHub models — a login, in a GA dimension — and the
        // constant 'BldrsLocalStorage' for every other adapter, so it leaked
        // and told us nothing at once (#1834). A "Download again" row carries
        // no kind (the history row predates this field, and the server row
        // never had it), which is what 'unknown' means here.
        source_kind: artifact.kindLabel || 'unknown',
        // Which shape the file is in, not just how it was squeezed: a
        // portable export is a different artifact from the batched-native
        // one at the same codec, and the funnel question #1843 asks is
        // whether anyone chooses it.
        portable: Boolean(options.portable),
        // A free-tier export rather than a Pro one: the funnel's "do free
        // exports convert" question (§7.1). Since the slot rule (2026-10-27)
        // it means "exported on the free tier", no longer "spent one of the
        // 2 free exports".
        free_export: Boolean(slots),
        // This export took a new model slot (its model held none). False for
        // a model already holding one — a private model opened earlier, or
        // one exported before — and for Pro.
        slot_taken: Boolean(slots?.taken),
      })
      reportModelExport(MODEL_GATES.NONE)
      return {filename, stats}
    } catch (e) {
      setError(e)
      // `reason` is the same three-way split as the handling below.
      reportFailure(exportFailureReason(e))
      if (e instanceof ProModuleDeniedError && e.reason === NO_FREE_SLOT_REASON) {
        // The model holds no slot and every slot is taken. The tier is right
        // (free) — it is the SLOTS the client had that were stale — so there
        // is no JWT to refresh; the refusal carries the slots, and storing
        // them turns the Export button into the slots-full gate on this
        // render.
        noteSlots(e.modelSlots)
        setSnackMessage({text: noFreeSlotMessage(e.modelSlots), autoDismiss: true})
        // ...unless the tier is NOT right: a JWT still saying Pro for an
        // account that was canceled or demoted (stale claim) renders an
        // ungated button and hides the slots (`ExportSection` only gates
        // `isFreeTier`), so every click would repeat this refusal. Read the
        // store NOW rather than a render-time closure, and refresh so the
        // claim flips to free and the gate these slots feed appears.
        if (getTier(useStore.getState().appMetadata, isAuthenticated) === TIERS.PAID) {
          refreshAppMetadata().catch((refreshError) => captureException(refreshError))
        }
      } else if (e instanceof ProModuleDeniedError) {
        // The server is the authority and it said no, so the badge that let
        // this click through is stale. Refresh the JWT and apply its claims,
        // so every app_metadata reader (the tier check above, the Profile
        // menu) agrees with the server on the next render.
        setSnackMessage({text: 'Export requires a Pro subscription', autoDismiss: true})
        refreshAppMetadata().catch((refreshError) => captureException(refreshError))
      } else {
        captureException(e)
        setSnackMessage({text: 'Export failed', autoDismiss: true})
      }
      return null
    } finally {
      setIsExporting(false)
    }
  }, [glbArtifact, getAccessTokenSilently, isAuthenticated, noteSlots, refreshAppMetadata, setIsExporting, setSnackMessage, user?.sub])

  return {run, isExporting, error}
}


/** `export_failed`'s `reason` when there is no artifact to export from */
export const EXPORT_UNAVAILABLE_REASON = 'unavailable'

/**
 * `export_failed`'s `reason` when `pro-module` refused a free user because
 * the model holds no slot and none is free: the one failure that is a gate's
 * verdict, so the one that also sends model_export {gate: 'blocked'}. Was
 * `free_limit` (2 exports per 7 days) until the slot rule of 2026-10-27; a
 * new value rather than a reused one, because what it counts changed.
 */
export const NO_SLOT_FAILURE_REASON = 'no_slot'


/**
 * The `reason` param of `export_failed` for a run that threw (the other
 * value, EXPORT_UNAVAILABLE_REASON, is for the artifact being gone).
 *
 * @param {Error} error What the export run threw
 * @return {'no_slot'|'denied'|'error'} no free model slot for this model;
 *   refused by the server otherwise (no Pro); anything else
 */
export function exportFailureReason(error) {
  if (error instanceof ProModuleDeniedError) {
    return error.reason === NO_FREE_SLOT_REASON ? NO_SLOT_FAILURE_REASON : 'denied'
  }
  return 'error'
}


/**
 * The snackbar for a free user the server refused because every model slot
 * is taken by other models.
 *
 * @param {?object} modelSlots The slots the refusal carried
 * @return {string}
 */
export function noFreeSlotMessage(modelSlots) {
  const limit = modelSlots?.limit
  const next = formatNextFreeSlot(modelSlots?.nextFreeAt)
  const full = limit ?
    `Your ${limit} free model slots for this week are taken by other models.` :
    'Your free model slots are taken by other models for now.'
  return next ? `${full} The next one frees up ${next}.` : full
}


/**
 * The host hook the pro module calls to rewrite the GLB, or null when neither
 * control asks for one (and there is then nothing for the host to do).
 *
 * "Neither" is the operative word since #1843, and it now covers three
 * controls: Portable and gzip are rewrites the host owns just as the codecs
 * are, so the predicate is `portable || codec || gzip` rather than the codec
 * alone. Either of the other two with no codec still goes through here, and
 * `artifactSizes.js` does the metadata strip for that case — the module runs
 * none of its own once a hook is in play.
 *
 * It resolves through `artifactSizes.js`'s per-(artifact, portable × codec)
 * cache, which the size line has almost always filled already — picking either
 * control runs the rewrite, and the click that follows finds the very bytes
 * whose length the user just read. A click fast enough to beat the estimate
 * shares its in-flight run rather than starting a second one.
 *
 * What it returns says which codec was APPLIED (`mode`) and whether the bytes
 * really are gzipped (`isGzipped`): the cache holds the uncompressed fallback
 * when the encoder could not load, and the pro module passes both on so the
 * filename, the history row and analytics describe the real file.
 *
 * @param {object} artifact The store's `glbArtifact` slot, or a history row's
 * @param {object} options The run's options, carrying `compression`, `quality`,
 *   `portable` + `gzip`
 * @return {?Function} `(glbBytes, {stripBldrsMetadata}) => Promise<object>`
 */
function compressHookFor(artifact, options) {
  const mode = options.compression
  const isPortable = Boolean(options.portable)
  const hasCodec = isCompressionMode(mode) && mode !== COMPRESSION_NONE
  // Checked HERE and not only in the panel, because a "Download again" row
  // replays the options its export ran with and can be replayed on a browser
  // that has no `CompressionStream` — Safari only got one in 16.4. An export
  // that asked for gzip and could not have it comes back as a plain `.glb`
  // named `.glb`, the same shape as the codec fallback below; what must never
  // happen is uncompressed bytes under a `.gz` name (#1854).
  const isGzipped = Boolean(options.gzip) && isGzipAvailable()
  // A "Download again" row recorded before #1848 carries no quality at all,
  // and its own recorded `compression` is what it promises to reproduce — so
  // an absent rung resolves to the default rather than failing the re-export.
  const quality = isQualityLevel(options.quality) ? options.quality : QUALITY_DEFAULT
  if (!isPortable && !hasCodec && !isGzipped) {
    return null
  }
  const codec = hasCodec ? mode : COMPRESSION_NONE
  return async (glbBytes, {stripBldrsMetadata}) => {
    if (isGzipped) {
      // The gzipped path re-derives the bytes rather than reading them out of
      // a cache — gzip is deterministic, so this reproduces the very length
      // the size line quoted without a third copy of the file having sat in
      // memory since the user read it (`artifactSizes.js#gzippedExport`).
      const gzipped = await gzippedExport(
        artifact, codec, glbBytes, isPortable, quality, stripBldrsMetadata)
      if (!gzipped) {
        throw new Error(`useExport: gzipped ${mode} rewrite produced nothing`)
      }
      return {
        bytes: gzipped.bytes,
        withMetadataBytes: gzipped.withMetadataBytes,
        withoutMetadataBytes: gzipped.withoutMetadataBytes,
        strippedExtensions: gzipped.strippedExtensions,
        mode: gzipped.mode,
        isGzipped: true,
      }
    }
    const compressed = await compressedExport(artifact, codec, glbBytes, isPortable, quality)
    if (!compressed) {
      throw new Error(`useExport: ${isPortable ? 'portable ' : ''}${mode} rewrite produced nothing`)
    }
    return {
      bytes: stripBldrsMetadata ? compressed.withoutMetadata : compressed.withMetadata,
      withMetadataBytes: compressed.withMetadata.byteLength,
      withoutMetadataBytes: compressed.withoutMetadata.byteLength,
      strippedExtensions: compressed.strippedExtensions,
      mode: compressed.mode,
      isGzipped: false,
    }
  }
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
