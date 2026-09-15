import React, {ReactElement, useEffect, useState} from 'react'
import {Box, Button, Chip, MenuItem, Select, Stack, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {artifactPositionRange, artifactSizes} from '../../export/artifactSizes'
import {codecToSelect} from '../../export/codecSizes'
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
import useCodecSizes from '../../export/useCodecSizes'
import useExport, {formatBytes} from '../../export/useExport'
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
 * anonymous → log in; then free → upgrade; then Pro → the export itself. The
 * two non-Pro states render the button in the GATED look — visible, dimmed,
 * and clickable into help that says what unlocks it — rather than as a live
 * button that silently does something else. The tier check here is `getTier`,
 * the same mapping the server uses, but it decides only what is RENDERED —
 * the `pro-module` function re-checks the subscription on every request and
 * is the authority.
 *
 * Between the controls and the button sits what they cost: the download size
 * for the state they are in, and how much of that is Bldrs metadata. Both
 * figures are exact — the uncompressed ones are the same computation as the
 * strip itself (#1841, `loader/glbArtifactSize.js`), and a compressed one IS
 * the compressed file, measured (#1842) — so the number here is the number
 * the snackbar reports once the file has landed.
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
  // Default OFF: the batched-native shape is smaller and is what Share itself
  // reads best, and the rewrite trades JSON for portability — one node per
  // placement, which on a big model is megabytes of names and transforms no
  // codec compresses. It is the informed choice, so it is the opt-in one
  // (#1843).
  const [isPortable, setIsPortable] = useState(false)
  // Default Balanced, which for Meshopt means `FILTER`: −39.1% measured, with
  // positions bit-exact and only shading normals rounded. The reasoning, and
  // why a lossless rung still has to be reachable, is `exportQuality.js`
  // §QUALITY_DEFAULT.
  const [quality, setQuality] = useState(QUALITY_DEFAULT)

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
    sizesByCodec, measuringCodec, isMeasuring, isStopping, isSuppressed, start: startSizing, stop: stopSizing,
  } = useCodecSizes(glbArtifact, {quality, isPortable, isMetadataIncluded})
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

  useEffect(() => {
    let isStale = false
    setEstimate(null)
    setIsEstimating(true)
    artifactSizes(glbArtifact, compression, isPortable, quality).then((read) => {
      if (!isStale) {
        setEstimate({compression, isPortable, quality, sizes: read})
        setIsEstimating(false)
      }
    })
    return () => {
      isStale = true
    }
  }, [glbArtifact, compression, isPortable, quality])

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

  const sizes = estimate?.sizes ?? null

  const isPro = getTier(appMetadata, isAuthenticated) === TIERS.PAID
  // The loader publishes this once the artifact is actually in OPFS — on a
  // cache miss when the writer finishes, on a cache hit right away. Formats
  // that produce no artifact at all — a `.bld` assembly (its children each
  // have one, the assembly itself does not), a directly-loaded `.glb` — never
  // publish, so the button stays disabled and reads "Preparing GLB…"
  // indefinitely there. Telling those two states apart needs the loader to
  // say whether an artifact is even expected; until it does, disabled is the
  // correct behaviour and only the label overstates it (#1833).
  const isArtifactReady = Boolean(glbArtifact)

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
        `|${estimate.quality}|${isMetadataIncluded ? 'meta' : 'nometa'}`
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
  const isPendingEstimate = isEstimating && (compression !== COMPRESSION_NONE || isPortable)
  // What the sweep is doing, said honestly. "Stop" ends the QUEUE — the
  // encoders are synchronous wasm with no abort — so once it is pressed the
  // line names the codec that is still finishing rather than claiming the
  // work stopped (`export/codecSizes.js`).
  let sizingStatus = MSG_SIZES_TOO_BIG
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

  const onExportClick = async () => {
    await run('glb', {stripBldrsMetadata: !isMetadataIncluded, compression, quality, portable: isPortable})
  }

  const onUpgradeClick = async () => {
    await goToSubscription({
      stripeCustomerId: appMetadata?.stripeCustomerId || null,
      userEmail: appMetadata?.userEmail || '',
      isDay: theme.palette.mode === 'light',
      getAccessTokenSilently,
      useMock,
    })
  }

  const exportButton = (
    <Button
      variant='contained'
      color='accent'
      size='small'
      onClick={onExportClick}
      disabled={!isArtifactReady || isExporting}
      startIcon={isAuthenticated && isPro ? <FileDownloadIcon/> : <LockIcon/>}
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
  } else if (!isPro) {
    gatedButton = (
      <GatedAction
        slug='export-pro'
        title='Pro feature'
        body={MSG_EXPORT_NEEDS_PRO}
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
          <Typography variant='caption' color='text.secondary'>named nodes, opens anywhere</Typography>
        </Box>
        <Toggle
          onChange={() => setIsPortable(!isPortable)}
          checked={isPortable}
          data-testid='export-portable'
        />
      </Stack>
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
      >
        <Box>
          <Typography variant='body2'>Compression</Typography>
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
          inputProps={{'aria-label': 'Compression'}}
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
          and a permanent status line for it would be noise. */}
      {(isMeasuring || isSuppressed) &&
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
         {isSuppressed ?
           <Button
             size='small'
             sx={{textTransform: 'none'}}
             onClick={startSizing}
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
          things (#1848 §5). The rung names and this sub-caption are about
          FIDELITY, never size: `exportQuality.js` measured the coarse rung
          heavier than Balanced on some models, so a "Smallest" here would
          promise an ordering the encoders don't keep. */}
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
      {/* The size the controls above just chose, above the action it applies
          to. Its `data-bytes` is the raw count the label rounds, so a test
          can compare it with the downloaded file byte for byte rather than
          through "12.4 MB". */}
      {(downloadBytes !== null || isPendingEstimate) &&
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
         {isPendingEstimate ?
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
           </Typography>}
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
        {isAuthenticated && !isPro &&
         <Chip label='Pro' size='small' color='primary' data-testid='export-pro-chip'/>}
        {gatedButton}
      </Stack>
    </Stack>
  )
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


const MSG_EXPORT_NEEDS_PRO = 'Exporting a GLB needs a Pro subscription'
// Above ~50 MB nothing starts on its own: three encoders over an artifact
// that size is seconds of uninterruptible main-thread work, and the user
// should be the one who asks for it (`export/codecSizes.js`).
const MSG_SIZES_TOO_BIG = 'Codec sizes not measured'
const MSG_LOGIN_TO_EXPORT = 'Log in to export this model as a GLB'
