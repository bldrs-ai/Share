import React, {ReactElement, useEffect, useRef, useState} from 'react'
import {Box, Button, Chip, MenuItem, Select, Stack, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {
  artifactPositionRange,
  artifactSizes,
  retainOnlyCompressedExports,
  uncompressedSizes,
} from '../../export/artifactSizes'
import {codecToSelect, shouldAutoMeasure} from '../../export/codecSizes'
import {FREE_EXPORT_WINDOW_DAYS, formatNextFreeExport} from '../../export/freeExports'
import {
  QUALITY_DEFAULT,
  QUALITY_LABELS,
  QUALITY_LEVELS,
} from '../../export/exportQuality'
import {
  COMPRESSION_LABELS,
  COMPRESSION_MODES,
  COMPRESSION_NONE,
  compressionFidelityCaption,
} from '../../export/glbCompression'
import {isGzipAvailable} from '../../export/glbGzip'
import useCodecSizes from '../../export/useCodecSizes'
import useExport, {formatBytes} from '../../export/useExport'
import useFreeExports from '../../export/useFreeExports'
import {gtagEvent} from '../../privacy/analytics'
import {TIERS, getTier} from '../../quota/quota'
import useStore from '../../store/useStore'
import GatedAction from '../GatedAction'
import Toggle from '../Toggle'
import {useMock} from '../Profile/ProfileControl'
import {goToSubscription} from '../Profile/subscriptionNav'
import {
  FileDownloadOutlined as FileDownloadIcon,
  LockOutlined as LockIcon,
} from '@mui/icons-material'


/**
 * "Export" section of the Save dialog's Export tab: download the current
 * model as a standalone `.glb`, sold as a Pro feature.
 *
 * It sits beside Save because both are "get this model out of here", and the
 * user who wants a file reaches for the same control either way (#1838;
 * before that it lived in the Share dialog).
 *
 * The states resolve in this order (design/new/glb-export-premium.md §4.4):
 * no artifact yet beats everything (there is nothing to download); then
 * anonymous → log in; then a free user with no free exports left in the
 * rolling window → upgrade, saying when the next one frees up; then a free
 * user with exports left, or Pro → the export itself. The gated states render
 * the button in the GATED look — visible, dimmed, and clickable into help that
 * says what unlocks it — rather than as a live button that silently does
 * something else. A free user also sees how many of their free exports are
 * left (§4.8); Pro sees nothing new. The tier check here is `getTier`, the
 * same mapping the server uses, and the count is the server's — but both
 * decide only what is RENDERED: the `pro-module` function re-checks the
 * subscription and the free-export ledger on every request and is the
 * authority.
 *
 * The controls run in the order the choices COMPOUND: what goes in the file,
 * what shape it is in, how it is squeezed, how hard, and whether the result
 * travels in an archive. Compress download (#1854) is last for that reason
 * rather than beside the metadata toggle it otherwise resembles — it is the
 * only one that wraps the output of all the others.
 *
 * Between the controls and the button sits what they cost: the download size
 * for the state they are in, and how much of that is Bldrs metadata. Both
 * figures are exact — the uncompressed ones are the same computation as the
 * strip itself (#1841, `loader/glbArtifactSize.js`), a compressed one IS the
 * compressed file, measured (#1842), and a gzipped one is the `.glb.gz` the
 * browser will save (#1854) — so the number here is the number the snackbar
 * reports once the file has landed.
 *
 * Every label block is left-aligned against the theme, which centres a
 * Dialog's whole paper (`theme/Components.js`, `MuiDialog.paper.textAlign`):
 * centring made each two-line block float its shorter line under its longer
 * one, so "Download size" sat off-centre above its own caption (#1842). The
 * action row below stays centred, deliberately.
 *
 * @return {ReactElement}
 */
export default function ExportSection() {
  const appMetadata = useStore((state) => state.appMetadata)
  const glbArtifact = useStore((state) => state.glbArtifact)
  const setIsLoginVisible = useStore((state) => state.setIsLoginVisible)

  // Default ON: it's the user's own model, so the properties and spatial
  // tree ride along unless they're passing the file to someone else.
  const [isMetadataIncluded, setIsMetadataIncluded] = useState(true)
  // Default NONE: an uncompressed GLB opens in every viewer, while the other
  // two need the matching decoder registered in whatever the user opens it
  // with. Compression is the informed choice, so it is the opt-in one.
  const [compression, setCompression] = useState(COMPRESSION_NONE)
  // Whether the user has picked the codec THEMSELVES. Once they have, the
  // background sweep's auto-selection stands down for good: a dropdown that
  // moves under the cursor because a later-arriving figure turned out smaller
  // is worse than a suboptimal default (#1850).
  const [isCodecUserChosen, setIsCodecUserChosen] = useState(false)
  // Default ON (owner decision, #1831): a file the user downloads is one they
  // mean to open somewhere, and the batched-native shape is refused outright
  // by viewers that don't implement `EXT_mesh_gpu_instancing` (3dviewer.net)
  // and opens as a flat `mesh_N` list in the rest. Share reads both shapes
  // back to the same pickable model (#1849), so nothing is lost for Share
  // either. What it costs is JSON — one node per placement, ~100 B each
  // (glb-export-premium.md §4.3) — which on an instance-heavy model can be
  // most of the file; the helper text below says so, and turning it off is
  // the informed choice. Not persisted anywhere: every visit starts portable,
  // and a "Download again" row replays the options it recorded, so rows
  // written while the default was off still reproduce their native file.
  const [isPortable, setIsPortable] = useState(true)
  // Default Balanced, which for Meshopt means `FILTER`: −39.1% measured, with
  // positions bit-exact and only shading normals rounded. The reasoning, and
  // why a lossless rung still has to be reachable, is `exportQuality.js`
  // §QUALITY_DEFAULT.
  const [quality, setQuality] = useState(QUALITY_DEFAULT)
  // Default OFF, and last in the order: gzip wraps whatever the four controls
  // above produced, so it compounds after all of them. It is the largest
  // lossless win the panel has — ~6× on a real large model, because the
  // container and not the geometry is where the bytes are (#1854) — but a
  // `.glb.gz` does not drop into the three.js editor, so it is an explicit
  // choice and never a silent one.
  const [isGzipped, setIsGzipped] = useState(false)

  const {getAccessTokenSilently, isAuthenticated} = useAuth0()
  // `isExporting` is tab-wide, not this button's own (store/UISlice.js): a
  // "Download again" running in the list below must disable this button too,
  // or the user gets two exports racing each other's history write (#1834).
  const {isExporting, run} = useExport()
  // Every codec's real size, measured in the background while the tab is open
  // — because which one wins swings with model shape, and swings against
  // intuition: Draco cannot touch `EXT_mesh_gpu_instancing` accessors at all,
  // which is most of a batched-native artifact (#1850, `codecSizes.js`).
  const {
    sizesByCodec, measuringCodec, isMeasuring, isStopping, isPaused,
    start: startSizing, stop: stopSizing,
  } = useCodecSizes(glbArtifact, {quality, isPortable, isGzipped, isMetadataIncluded, compression})
  const theme = useTheme()
  // Both download sizes, read from the artifact's header when the tab opens
  // (`export/artifactSizes.js`) — null while that read is in flight and for
  // an artifact whose sizes can't be read, in which case the line is simply
  // absent. A placeholder that flashes a number and then corrects itself is
  // worse than no number: this one is a promise about the file the next
  // click produces.
  //
  // Held together with the selection the figures were computed FOR, rather
  // than as the figures alone, because the two get out of step by one render:
  // the click that changes a control re-renders with the new selection before
  // the effect below has even re-run, so for that render the OLD figures are
  // on screen under the NEW controls. `displayedEstimateKey` publishes the
  // distinction.
  const [estimate, setEstimate] = useState(null)
  // Whether a read is still in flight, as opposed to having come back with
  // nothing. Uncompressed the two are indistinguishable to the user — a
  // header read is a few milliseconds — but a compression run is seconds on a
  // real model, and a size line that simply vanishes for that long reads as a
  // broken panel rather than as work in progress.
  const [isEstimating, setIsEstimating] = useState(false)
  // The artifact's own geometry bounds, which is all the millimetre caption
  // needs. A property of the model rather than of any selection, so it is read
  // once per artifact and rides on the size line's cached header read
  // (`export/artifactSizes.js#artifactPositionRange`) — no second file read.
  const [positionRange, setPositionRange] = useState(null)
  // The artifact as of the last render, for the unmount teardown below: a
  // cleanup with an empty dependency list closes over the value this panel
  // mounted with, and the store publishes a fresh slot per load.
  const artifactRef = useRef(glbArtifact)
  artifactRef.current = glbArtifact
  // The artifact the user has asked to have measured ("Calculate sizes", in
  // the sweep's row or on the size line), so consent lapses with a new load
  // rather than carrying over to a model nobody asked about. An artifact
  // rather than a boolean so no reset effect has to race the size effect.
  const [consentedArtifact, setConsentedArtifact] = useState(null)
  const isSizingConsented = consentedArtifact !== null && consentedArtifact === glbArtifact

  useEffect(() => {
    let isStale = false
    setEstimate(null)
    setIsEstimating(true)
    // Portable with nothing else selected is the panel's DEFAULT state, and
    // its estimate is no header read: it reads the whole artifact off OPFS
    // and rewrites it (`export/artifactSizes.js`). Opening the tab used to
    // cost a header read; with Portable on by default it would cost a full
    // rewrite on every model, a 400 MB one included — exactly what the codec
    // sweep's threshold holds back until the user clicks "Calculate sizes"
    // (`codecSizes.js#shouldAutoMeasure`, codex on #1904). So over that same
    // threshold this waits for the same click. A codec or gzip the user
    // picks is a click of its own and runs as it always has; and none of this
    // touches the EXPORT, which keeps Portable and pays for the rewrite when
    // the user asks for the file. The threshold reads the header, which the
    // sweep has already cached for this artifact.
    const estimateNow = () => {
      artifactSizes(glbArtifact, compression, isPortable, quality, isGzipped).then((read) => {
        if (!isStale) {
          setEstimate({compression, isPortable, quality, isGzipped, sizes: read})
          setIsEstimating(false)
        }
      })
    }
    const isDefaultPortable = isPortable && compression === COMPRESSION_NONE && !isGzipped
    if (!isDefaultPortable || isSizingConsented) {
      estimateNow()
    } else {
      uncompressedSizes(glbArtifact).then((header) => {
        if (isStale) {
          return
        }
        if (header && !shouldAutoMeasure(header.withMetadata)) {
          setEstimate({compression, isPortable, quality, isGzipped, sizes: null, isUnmeasured: true})
          setIsEstimating(false)
        } else {
          estimateNow()
        }
      })
    }
    // The read above POPULATES a compressed cell for the codec on screen —
    // two whole copies of the export. Nothing is claimed for it here; the
    // reconcile below states which cells should exist at all, and this one is
    // always in that set.
    return () => {
      isStale = true
    }
  }, [glbArtifact, compression, isPortable, quality, isGzipped, isSizingConsented])

  useEffect(() => {
    let isStale = false
    setPositionRange(null)
    artifactPositionRange(glbArtifact).then((range) => {
      if (!isStale) {
        setPositionRange(range)
      }
    })
    return () => {
      isStale = true
    }
  }, [glbArtifact])

  useEffect(() => {
    // The whole point of the sweep: once every codec has reported, the panel
    // defaults to the smallest rather than leaving the user to click through
    // all three and remember. `codecToSelect` is where the two refusals live
    // — an unfinished sweep, and a codec the user chose themselves.
    const best = codecToSelect(sizesByCodec, isMetadataIncluded, isCodecUserChosen, compression)
    if (best !== null) {
      setCompression(best)
    }
  }, [sizesByCodec, isMetadataIncluded, isCodecUserChosen, compression])

  useEffect(() => {
    // Everything the estimate cache is allowed to keep, stated as a set
    // rather than performed as a claim and a release. At most two cells: the
    // one behind the figure on screen, and — only while the auto-selection is
    // about to move the dropdown onto it — the winner the sweep left for
    // exactly that. `codecToSelect` is the same call the effect above makes,
    // so the two cannot disagree about which that is, and the ordering
    // between them does not matter: the effect that runs first keeps both
    // cells, the next render drops the one the selection did not become.
    //
    // That derivation is what dissolves the finding this replaced. A winner
    // the panel will NOT select — because the user picked a codec themselves,
    // which is `codecToSelect`'s other refusal — is a cell nobody will read,
    // while the user's own cell was the one going unheld (#1852 review).
    //
    // Skipped while a sweep is running: a run bounds its own memory as it
    // goes and protects the selection while doing it (`codecSizes.js`), and
    // reconciling against a selection that knows nothing of the best-so-far
    // would throw the winner away mid-run. Being wrong here costs a
    // re-encode and never a wrong figure, because the selection's own cell is
    // in the set on every path — which is the invariant the size line rests
    // on: displayed size == downloaded bytes.
    if (isMeasuring) {
      return
    }
    const keep = [{mode: compression, isPortable, quality}]
    const pending = codecToSelect(sizesByCodec, isMetadataIncluded, isCodecUserChosen, compression)
    if (pending !== null) {
      keep.push({mode: pending, isPortable, quality})
    }
    retainOnlyCompressedExports(glbArtifact, keep)
  }, [
    glbArtifact, compression, isPortable, quality,
    isMeasuring, sizesByCodec, isMetadataIncluded, isCodecUserChosen,
  ])

  useEffect(() => () => {
    // Nothing outside this panel reads an estimate cell — reopening the tab
    // re-runs the whole codec axis from scratch — so the panel takes the
    // cache with it. Its own effect, because the reconcile above re-runs on
    // every selection change and a cleanup there would empty the cache on
    // each one instead of only when there is no panel left to read it.
    //
    // A sweep still finishing cannot resurrect anything: every cell a run can
    // create is created by the `artifactSizes` call it is already awaiting,
    // and past its abort the loop starts no further codec
    // (`export/codecSizes.js`), so the last cell it can add already exists
    // when this runs.
    retainOnlyCompressedExports(artifactRef.current, [])
  }, [])

  const sizes = estimate?.sizes ?? null

  const isPro = getTier(appMetadata, isAuthenticated) === TIERS.PAID
  // The free tier's allowance as the server last stated it, or null (Pro,
  // anonymous, or not known yet). Unknown is NOT gated: the click goes to
  // `pro-module`, which counts for itself, and a refusal there fills this in.
  const freeAllowance = useFreeExports()
  const isFreeTier = isAuthenticated && !isPro
  const isAtFreeLimit = isFreeTier && freeAllowance?.remaining === 0
  const nextFreeExport = formatNextFreeExport(freeAllowance?.nextFreeAt)
  // The loader publishes this once the artifact is actually in OPFS — on a
  // cache miss when the writer finishes, on a cache hit right away. Formats
  // that produce no artifact at all — a `.bld` assembly (its children each
  // have one, the assembly itself does not), a directly-loaded `.glb` — never
  // publish, so the button stays disabled and reads "Preparing GLB…"
  // indefinitely there. Telling those two states apart needs the loader to
  // say whether an artifact is even expected; until it does, disabled is the
  // correct behaviour and only the label overstates it (#1833).
  const isArtifactReady = Boolean(glbArtifact)
  // A browser capability, read at render rather than at import: jsdom has no
  // `CompressionStream`, so the panel's own suite plants one and a constant
  // captured at module load would have frozen the answer before it did.
  const isGzipSupported = isGzipAvailable()

  let label = 'Export GLB'
  if (isExporting) {
    label = 'Exporting…'
  } else if (!isArtifactReady) {
    label = 'Preparing GLB…'
  }

  // What the button will hand over, for the toggle as it stands. The
  // snackbar reports `blob.size` after the download and must agree with it —
  // `loader/glbArtifactSize.js` is the same computation the strip runs, so
  // it does, exactly (#1841).
  const downloadBytes = sizes && (isMetadataIncluded ? sizes.withMetadata : sizes.withoutMetadata)
  // Which selection the figure beside it is FOR. Two selections can produce
  // the SAME byte count — a codec whose encoder failed falls back to the file
  // as it is (#1842), and Portable is a documented pass-through on a
  // merged-layout artifact (`export/glbPortable.js`) — so the count alone
  // cannot say whether the line has caught up with the controls, and a test
  // that waits for it to change waits forever. This can. The codec/portable
  // half comes from the ESTIMATE, so it lags the controls exactly as the
  // figure does; the metadata half is live, because that toggle picks between
  // two figures one estimate already produced (it is deliberately not in the
  // effect's deps above). Read by `tests/e2e/exportEstimate.ts`, which is the
  // other end of this contract.
  const displayedEstimateKey = estimate &&
        `${estimate.isPortable ? 'portable' : 'native'}|${estimate.compression}` +
        `|${estimate.quality}|${estimate.isGzipped ? 'gzip' : 'plain'}` +
        `|${isMetadataIncluded ? 'meta' : 'nometa'}`
  const metadataCaption = sizes && sizes.metadataBytes > 0 ?
    `${formatBytes(sizes.metadataBytes)} of Bldrs metadata ${isMetadataIncluded ? 'included' : 'removed'}` :
    null
  // The compressed estimate is the compressed file, so it only exists once
  // the encoder has run. Say so while it does, rather than showing a stale
  // figure from the previous choice: the line's promise is about the NEXT
  // click, and for the seconds this takes it has nothing to promise.
  // Portable counts as pending work even with no codec: the rewrite has to
  // read the whole artifact off OPFS and re-serialise it, where the plain
  // uncompressed estimate is a header read (`export/artifactSizes.js`).
  // Gzip counts as pending work at every codec, `none` included: there is no
  // header shortcut for it — the whole file has to be read and compressed
  // before there is a figure — so the one selection that used to be instant
  // is not, and the line has to say so (#1854).
  const isPendingEstimate = isEstimating && (compression !== COMPRESSION_NONE || isPortable || isGzipped)
  // What the sweep is doing, said honestly. "Stop" ends the QUEUE — the
  // encoders are synchronous wasm with no abort — so once it is pressed the
  // line names the codec that is still finishing rather than claiming the
  // work stopped (`export/codecSizes.js`).
  // A parked sweep that has already published figures was stopped part-way;
  // one that has published none never started, because the artifact is over
  // the threshold. Derived rather than flagged: the hook's `isPaused` is one
  // state with one way out, and which sentence to print is the only place the
  // two entrances differ.
  let sizingStatus = Object.keys(sizesByCodec).length > 0 ? MSG_SIZING_STOPPED : MSG_SIZES_TOO_BIG
  if (isStopping) {
    sizingStatus = measuringCodec ?
      `Finishing ${COMPRESSION_LABELS[measuringCodec]}…` :
      'Stopping…'
  } else if (isMeasuring) {
    sizingStatus = measuringCodec ?
      `Sizing ${COMPRESSION_LABELS[measuringCodec]}…` :
      'Sizing…'
  }
  // What the rung costs the geometry, on THIS model — a distance in
  // millimetres for Draco, computed from the artifact's own primitive bounds,
  // and a sentence about shading for Meshopt, which leaves positions
  // bit-exact (`export/glbCompression.js#compressionFidelityCaption`). Read
  // off the ESTIMATE's selection, not the controls', for the same reason the
  // figure is: for the render between a click and the re-estimate the two
  // disagree, and a caption promising 4 mm above a 1 mm figure is worse than
  // no caption.
  const fidelityCaption = estimate && !isPendingEstimate ?
    compressionFidelityCaption(estimate.compression, estimate.quality, positionRange) :
    null
  // The figure is honest even when the codec is not available here (its
  // encoder failed to load, say): the estimate fell back to the file as it
  // is — uncompressed, or still in the codec the cache wrote it with — and
  // so will the download. But "Draco" chosen beside that figure reads as a
  // Draco figure, so the fallback is named, with what the file actually is.
  const isFallback = sizes && compression !== COMPRESSION_NONE && sizes.compression !== compression
  let fallbackCaption = null
  if (isFallback) {
    const actual = sizes.compression === COMPRESSION_NONE ?
      'the file is uncompressed' :
      `the file keeps ${COMPRESSION_LABELS[sizes.compression] || sizes.compression}`
    fallbackCaption = `${COMPRESSION_LABELS[compression]} isn't available in this browser — ${actual}`
  }

  // One consent for both figures that wait on it: the codec sweep's and the
  // size line's (above). Either button grants it.
  const onCalculateSizes = () => {
    setConsentedArtifact(glbArtifact)
    startSizing()
  }
  const isUnmeasured = Boolean(estimate?.isUnmeasured) && !isEstimating

  const onExportClick = async () => {
    await run(
      'glb',
      {stripBldrsMetadata: !isMetadataIncluded, compression, quality, portable: isPortable, gzip: isGzipped})
  }

  const onUpgradeClick = async () => {
    await goToSubscription({
      stripeCustomerId: appMetadata?.stripeCustomerId || null,
      userEmail: appMetadata?.userEmail || '',
      isDay: theme.palette.mode === 'light',
      getAccessTokenSilently,
      useMock,
      from: 'export',
    })
  }

  const exportButton = (
    <Button
      variant='contained'
      color='accent'
      size='small'
      onClick={onExportClick}
      disabled={!isArtifactReady || isExporting}
      startIcon={isAuthenticated && !isAtFreeLimit ? <FileDownloadIcon/> : <LockIcon/>}
      sx={{textTransform: 'none'}}
      data-testid='export-glb-button'
    >
      {label}
    </Button>
  )

  // The signed-out branch is defensive: the Save dialog this section lives in
  // only opens for a signed-in user (an anonymous Save click gets its own
  // gate). Kept so the section stays correct wherever it is mounted.
  let gatedButton = exportButton
  if (!isAuthenticated) {
    gatedButton = (
      <GatedAction
        slug='export-anonymous'
        title='Log in to export'
        body={MSG_LOGIN_TO_EXPORT}
        actionLabel='Log in'
        onAction={() => setIsLoginVisible(true)}
        onOpen={() => gtagEvent('export_gated', {reason: 'anonymous'})}
      >
        {exportButton}
      </GatedAction>
    )
  } else if (isAtFreeLimit) {
    // The existing Pro upsell, now reached when the free allowance runs out
    // rather than on the first click (§7.1). Same slug and `reason` as the
    // Pro-only gate it replaces, so the funnel's `export_gated` series and
    // the `from: 'export'` upgrade click carry on unbroken.
    gatedButton = (
      <GatedAction
        slug='export-pro'
        title='Free exports used'
        body={freeLimitHelp(freeAllowance.limit, nextFreeExport)}
        actionLabel='Upgrade to Pro'
        onAction={onUpgradeClick}
        onOpen={() => gtagEvent('export_gated', {reason: 'free'})}
      >
        {exportButton}
      </GatedAction>
    )
  }

  // No section heading: the tab this renders in is already labelled Export,
  // and the panel repeating it was the only thing between the tab bar and
  // the first control (#1838). No top margin of its own either — the 1em
  // gap down from the tab bar is the panel wrapper's (SaveModelControl.jsx
  // `TAB_PANEL_SX`), shared with the GitHub tab so both read as the same
  // gutter.
  return (
    // No `spacing` here: the only gap this Stack needs — content down to the
    // action row — is the action row's own `mt: '1em'` below, so there's one
    // source of truth for it rather than a Stack spacing and an `mt` adding
    // up to something other than 1em.
    <Stack
      data-testid='export-section'
      // Which codecs the background sweep has a figure for, in the order it
      // measured them. The figures themselves live on the dropdown options,
      // where the user compares them; this says whether the sweep is still
      // going — which is what an E2E needs before it touches the codec
      // control, since an auto-selection landing mid-click would move the
      // dropdown out from under it (`tests/e2e/export.ts#waitForCodecSizing`).
      data-codec-sizes={COMPRESSION_MODES.filter((mode) => mode in sizesByCodec).join(',')}
      sx={{textAlign: 'left'}}
    >
      <Stack direction='row' justifyContent='space-between' alignItems='center' gap={1}>
        <Box>
          <Typography variant='body2'>Include Bldrs metadata</Typography>
          <Typography variant='caption' color='text.secondary'>properties, spatial tree</Typography>
        </Box>
        <Toggle
          onChange={() => setIsMetadataIncluded(!isMetadataIncluded)}
          checked={isMetadataIncluded}
          data-testid='export-include-metadata'
        />
      </Stack>
      {/* Between the metadata toggle and the codec because that is the order
          the choices compound in: what goes in the file, what SHAPE it is in,
          and only then how it is squeezed (`export/artifactSizes.js` runs them
          in exactly that order). */}
      <Stack
        direction='row'
        justifyContent='space-between'
        alignItems='center'
        gap={1}
        sx={{mt: '1em'}}
      >
        <Box>
          <Typography variant='body2'>Portable</Typography>
          <Typography variant='caption' color='text.secondary'>named nodes, no instancing</Typography>
        </Box>
        <Toggle
          onChange={() => setIsPortable(!isPortable)}
          checked={isPortable}
          data-testid='export-portable'
        />
      </Stack>
      {/* Under the toggle rather than in its caption: this is the one
          default whose OFF side needs explaining — what instancing buys, and
          where it stops opening — and the row caption has room for a phrase,
          not a trade-off. */}
      <Typography
        variant='caption'
        color='text.secondary'
        component='p'
        sx={{mt: '0.25em'}}
        data-testid='export-portable-help'
      >
        {MSG_PORTABLE_HELP}
      </Typography>
      {/* An exclusive three-way choice rather than two more switches: the
          codecs are alternatives, not independent options, and a group makes
          that unmistakable. `flexWrap` because at 390px the label and three
          buttons together are wider than the dialog's content column, and the
          Export tab must not push the document sideways (#1838). */}
      <Stack
        direction='row'
        justifyContent='space-between'
        alignItems='center'
        flexWrap='wrap'
        gap={1}
        sx={{mt: '1em'}}
        data-testid='export-compression-row'
      >
        <Box>
          <Typography variant='body2'>Compression type</Typography>
          <Typography variant='caption' color='text.secondary'>needs a matching decoder</Typography>
        </Box>
        {/* A dropdown, not a toggle group: three side-by-side buttons were
            the widest control in the dialog and read as a run-on word at
            the theme's toggle styling (owner feedback on #1842). The
            menu items carry the per-mode test ids. */}
        <Select
          value={compression}
          size='small'
          onChange={(event) => setCompression(event.target.value)}
          inputProps={{'aria-label': 'Compression type'}}
          // The CLOSED control shows the bare label, never the size. The
          // menu is where the comparison happens and where there is room for
          // it; at 390px "Meshopt · 1.3 MB" would either ellipsize away the
          // half that matters or push the dialog sideways (#1838).
          renderValue={(mode) => COMPRESSION_LABELS[mode]}
          sx={{minWidth: '8em', textAlign: 'left'}}
          data-testid='export-compression'
        >
          {COMPRESSION_MODES.map((mode) => (
            <MenuItem
              key={mode}
              value={mode}
              // "The user chose" hangs off the ITEM, not off the Select's
              // `onChange`, because MUI fires `onChange` only when the value
              // actually changes — and picking the codec that is already
              // selected, having just read the three sizes, is exactly how a
              // user says "this one, stop moving it". The sweep must stand
              // down for that click too (`codecSizes.js#codecToSelect`).
              onClick={() => setIsCodecUserChosen(true)}
              // The raw count beside the rounded label, like the size line's,
              // so a test can compare the figure the user chose by with the
              // downloaded file byte for byte.
              data-bytes={codecBytes(sizesByCodec[mode], isMetadataIncluded) ?? undefined}
              data-testid={`export-compression-${mode}`}
            >
              {COMPRESSION_LABELS[mode]}
              {codecBytes(sizesByCodec[mode], isMetadataIncluded) !== null &&
               <Typography component='span' variant='caption' color='text.secondary' sx={{ml: 1}}>
                 {formatBytes(codecBytes(sizesByCodec[mode], isMetadataIncluded))}
               </Typography>}
            </MenuItem>
          ))}
        </Select>
      </Stack>
      {/* What the background sweep is doing, and the one control over it.
          Only rendered while there is something to say — a finished sweep on
          a small model is over before most users have read the label above,
          and a permanent status line for it would be noise. A PARKED sweep
          still has something to say, though, and it is the only way back:
          hiding the row on a stopped-but-incomplete sweep took the Stop and
          the Calculate buttons with it, leaving no route to a winner short of
          reopening the dialog (#1852 review). */}
      {(isMeasuring || isPaused) &&
       <Stack
         direction='row'
         justifyContent='space-between'
         alignItems='center'
         flexWrap='wrap'
         gap={1}
         sx={{mt: '0.5em'}}
         data-testid='export-codec-sizes'
       >
         <Typography variant='caption' color='text.secondary' data-testid='export-codec-sizes-status'>
           {sizingStatus}
         </Typography>
         {isPaused ?
           <Button
             size='small'
             sx={{textTransform: 'none'}}
             onClick={onCalculateSizes}
             data-testid='export-codec-sizes-start'
           >
             Calculate sizes
           </Button> :
           <Button
             size='small'
             sx={{textTransform: 'none'}}
             disabled={isStopping}
             onClick={stopSizing}
             data-testid='export-codec-sizes-stop'
           >
             Stop
           </Button>}
       </Stack>}
      {/* Directly under Compression, because it only means anything once a
          codec is chosen — and disabled rather than hidden while it isn't, so
          the panel doesn't change height under the user's cursor when they
          pick one. Presets rather than bit counts: the bit count is
          meaningless to a CAD user and dangerous when wrong, and the two
          codecs' knobs don't line up, so one number would mean two different
          things (#1848 §5). The rung names are FIDELITY names with a size
          HINT in parentheses — larger / medium / small — and the hint
          is deliberately not a superlative: `exportQuality.js` measured the
          coarse rung heavier than Balanced under SEQUENTIAL, so "Smallest"
          would promise an ordering the encoders don't keep while "small"
          reads against the real per-codec bytes on the dropdown above. */}
      <Stack
        direction='row'
        justifyContent='space-between'
        alignItems='center'
        flexWrap='wrap'
        gap={1}
        sx={{mt: '1em'}}
      >
        <Box>
          <Typography variant='body2'>Quality</Typography>
          <Typography variant='caption' color='text.secondary'>how much detail to keep</Typography>
        </Box>
        <Select
          value={quality}
          size='small'
          disabled={compression === COMPRESSION_NONE}
          onChange={(event) => setQuality(event.target.value)}
          inputProps={{'aria-label': 'Quality'}}
          sx={{minWidth: '8em', textAlign: 'left'}}
          data-testid='export-quality'
        >
          {QUALITY_LEVELS.map((level) => (
            <MenuItem key={level} value={level} data-testid={`export-quality-${level}`}>
              {QUALITY_LABELS[level]}
            </MenuItem>
          ))}
        </Select>
      </Stack>
      {/* LAST of the controls, because gzip is the only one that wraps the
          others: the four above decide what the `.glb` contains and how its
          geometry is encoded, and this decides whether that file travels
          compressed. The panel's stated order is the order the choices
          compound in (`export/artifactSizes.js` runs them in it), and gzip
          compounds after all of them — which is also why it sits directly
          above the size line it changes most.

          Hidden outright where `CompressionStream` is missing (Safari before
          16.4). A disabled toggle would be the usual choice here — the Quality
          control two rows up is disabled rather than hidden for exactly the
          layout reason — but this one is different in kind: Quality is
          unavailable because of something the user can change in this panel,
          while gzip is unavailable because of the browser, and there is no
          click that would help. What must not happen is uncompressed bytes
          under a `.gz` name (#1854). */}
      {isGzipSupported &&
       <Stack
         direction='row'
         justifyContent='space-between'
         alignItems='center'
         flexWrap='wrap'
         gap={1}
         sx={{mt: '1em'}}
         data-testid='export-gzip-row'
       >
         <Box>
           <Typography variant='body2'>Compress download</Typography>
           <Typography variant='caption' color='text.secondary'>
             {MSG_GZIP_CAPTION}
           </Typography>
         </Box>
         <Toggle
           onChange={() => setIsGzipped(!isGzipped)}
           checked={isGzipped}
           data-testid='export-gzip'
         />
       </Stack>}
      {/* The size the controls above just chose, above the action it applies
          to. Its `data-bytes` is the raw count the label rounds, so a test
          can compare it with the downloaded file byte for byte rather than
          through "12.4 MB". */}
      {(downloadBytes !== null || isPendingEstimate || isUnmeasured) &&
       <Stack
         direction='row'
         justifyContent='space-between'
         alignItems='center'
         gap={1}
         sx={{mt: '1em'}}
       >
         <Box>
           <Typography variant='body2'>Download size</Typography>
           {metadataCaption &&
            <Typography variant='caption' color='text.secondary'>{metadataCaption}</Typography>}
           {fidelityCaption &&
            <Typography
              variant='caption'
              color='text.secondary'
              display='block'
              data-testid='export-quality-caption'
            >
              {fidelityCaption}
            </Typography>}
           {fallbackCaption &&
            <Typography
              variant='caption'
              color='warning.main'
              display='block'
              data-testid='export-compression-fallback'
            >
              {fallbackCaption}
            </Typography>}
         </Box>
         {isUnmeasured &&
          // Over the auto-measure threshold, Portable's figure waits for
          // consent (above) — so no number rather than the wrong one, and the
          // sweep's own button beside it.
          <Stack direction='row' alignItems='center' gap={1} data-testid='export-size-unmeasured'>
            <Typography variant='body2' color='text.secondary'>Not measured</Typography>
            <Button
              size='small'
              sx={{textTransform: 'none'}}
              onClick={onCalculateSizes}
              data-testid='export-size-calculate'
            >
              Calculate sizes
            </Button>
          </Stack>}
         {!isUnmeasured && (isPendingEstimate ?
           <Typography variant='body2' color='text.secondary' data-testid='export-size-pending'>
             Estimating…
           </Typography> :
           <Typography
             variant='body2'
             data-testid='export-size'
             data-bytes={downloadBytes}
             data-estimate-key={displayedEstimateKey}
           >
             {formatBytes(downloadBytes)}
           </Typography>)}
       </Stack>}
      {/* The action goes LAST, after everything that configures it, and
          centred — the Pro chip for free users rides beside it (#1838).
          `mt: '1em'` is this row's own gap from what configures it, matching
          the GitHub tab's gap down to its action button. Wraps rather than
          overflowing: at 390px the button and the Pro chip together are wider
          than the dialog's content column. */}
      <Stack
        direction='row'
        justifyContent='center'
        alignItems='center'
        flexWrap='wrap'
        gap={1}
        sx={{mt: '1em', textAlign: 'center'}}
        data-testid='export-action-row'
      >
        {isFreeTier &&
         <Chip label='Pro' size='small' color='primary' data-testid='export-pro-chip'/>}
        {gatedButton}
      </Stack>
      {/* What a free user has left. Under the action rather than beside it:
          at 390px the row already holds the button and the Pro chip, and a
          caption in it would push the row into a wrap. `data-remaining`
          carries the raw count for the E2E. */}
      {isFreeTier && freeAllowance &&
       <Typography
         variant='caption'
         color='text.secondary'
         sx={{mt: '0.5em', textAlign: 'center'}}
         data-testid='export-free-remaining'
         data-remaining={freeAllowance.remaining}
       >
         {freeRemainingCaption(freeAllowance, nextFreeExport)}
       </Typography>}
    </Stack>
  )
}


/**
 * The count line under a free user's Export button.
 *
 * @param {{limit: number, remaining: number}} allowance
 * @param {?string} nextFreeExport formatted `nextFreeAt`, or null
 * @return {string} e.g. '1 of 2 free exports left this week'
 */
function freeRemainingCaption({limit, remaining}, nextFreeExport) {
  const count = `${remaining} of ${limit} free exports left this week`
  // At the limit the line also says when that changes; above it, the help
  // that names the date is one click away and the line stays short.
  return remaining === 0 && nextFreeExport ? `${count} · next one ${nextFreeExport}` : count
}


/**
 * The at-the-limit gate's help text.
 *
 * @param {number} limit
 * @param {?string} nextFreeExport formatted `nextFreeAt`, or null
 * @return {string}
 */
function freeLimitHelp(limit, nextFreeExport) {
  const used = `You've used your ${limit} free exports for the last ${FREE_EXPORT_WINDOW_DAYS} days.`
  const next = nextFreeExport ? ` Your next free export is available ${nextFreeExport}.` : ''
  return `${used}${next} Pro exports are unlimited.`
}


/**
 * Which of one codec's two figures the dropdown shows, following the metadata
 * toggle so the option a user compares by is the file they would get.
 *
 * @param {?object} sizes One codec's entry in the sweep's results
 * @param {boolean} isMetadataIncluded
 * @return {?number} the byte count, or null while it is unknown or unreadable
 */
function codecBytes(sizes, isMetadataIncluded) {
  if (!sizes) {
    return null
  }
  return isMetadataIncluded ? sizes.withMetadata : sizes.withoutMetadata
}


// Above ~50 MB nothing starts on its own: three encoders over an artifact
// that size is seconds of uninterruptible main-thread work, and the user
// should be the one who asks for it (`export/codecSizes.js`).
const MSG_SIZES_TOO_BIG = 'Codec sizes not measured'
// A sweep the user stopped part-way: some codecs have figures, the rest never
// ran, and the same "Calculate sizes" button restarts the axis.
const MSG_SIZING_STOPPED = 'Codec sizing stopped'
const MSG_LOGIN_TO_EXPORT = 'Log in to export this model as a GLB'
// Names the file the user gets, because that is the part that surprises: a
// `.glb.gz` is not a `.glb` and will not drop into the three.js editor
// without being unarchived first (#1854). Share itself opens one back —
// drag-drop or the Open dialog's Local tab strip the envelope
// (`loader/gzipEnvelope.js`, #1831) — which is what the caption promises
// now that the round trip closes. Short enough to stay on one line at 390px
// beside the toggle.
const MSG_GZIP_CAPTION = 'gzip — saves a .glb.gz, reopens in Share'
// Owner's wording (#1831), less its first draft's "open in any glTF viewer":
// with a codec selected — and the background sweep may select one on its own
// — the portable file still needs that codec's decoder, and 3dviewer.net
// refuses `EXT_meshopt_compression` outright (codex on #1904). So it says what
// Portable itself changes and no more; codec support is the Compression
// row's caption to make. What turning Portable OFF buys and costs, since ON
// is now the default: instancing stores a repeated part once, and
// `EXT_mesh_gpu_instancing` is a required extension some viewers refuse.
const MSG_PORTABLE_HELP =
  'Portable files leave out instancing, so more glTF viewers can open them. Turn off to keep ' +
  'instancing: repeated parts are stored once, which can make very large models much smaller, ' +
  'but some viewers don\'t support it.'
