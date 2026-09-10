import React, {ReactElement, useState} from 'react'
import {Box, Button, Chip, Stack, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import useExport from '../../export/useExport'
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
 * @return {ReactElement}
 */
export default function ExportSection() {
  const appMetadata = useStore((state) => state.appMetadata)
  const glbArtifact = useStore((state) => state.glbArtifact)
  const setIsLoginVisible = useStore((state) => state.setIsLoginVisible)

  // Default ON: it's the user's own model, so the properties and spatial
  // tree ride along unless they're passing the file to someone else.
  const [isMetadataIncluded, setIsMetadataIncluded] = useState(true)

  const {getAccessTokenSilently, isAuthenticated} = useAuth0()
  // `isExporting` is tab-wide, not this button's own (store/UISlice.js): a
  // "Download again" running in the list below must disable this button too,
  // or the user gets two exports racing each other's history write (#1834).
  const {isExporting, run} = useExport()
  const theme = useTheme()

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

  let label = 'Download GLB'
  if (isExporting) {
    label = 'Exporting…'
  } else if (!isArtifactReady) {
    label = 'Preparing GLB…'
  }

  const onExportClick = async () => {
    await run('glb', {stripBldrsMetadata: !isMetadataIncluded})
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
      size='small'
      onClick={onExportClick}
      disabled={!isArtifactReady || isExporting}
      startIcon={isAuthenticated && isPro ? <FileDownloadIcon/> : <LockIcon/>}
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

  return (
    <Stack spacing={1} data-testid='export-section' sx={{mt: 1}}>
      <Typography variant='overline'>Export</Typography>
      <Stack
        direction='row'
        justifyContent='space-between'
        alignItems='center'
        // Wraps rather than overflowing: at 390px the button and the Pro
        // chip together are wider than the dialog's content column.
        flexWrap='wrap'
        gap={1}
      >
        {gatedButton}
        {isAuthenticated && !isPro &&
         <Chip label='Pro' size='small' color='primary' data-testid='export-pro-chip'/>}
      </Stack>
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
    </Stack>
  )
}


const MSG_EXPORT_NEEDS_PRO = 'Exporting a GLB needs a Pro subscription'
const MSG_LOGIN_TO_EXPORT = 'Log in to export this model as a GLB'
