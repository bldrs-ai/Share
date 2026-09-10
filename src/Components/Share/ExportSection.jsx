import React, {ReactElement, useState} from 'react'
import {Box, Button, Chip, Stack, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import useExport from '../../export/useExport'
import {gtagEvent} from '../../privacy/analytics'
import {TIERS, getTier} from '../../quota/quota'
import useStore from '../../store/useStore'
import Toggle from '../Toggle'
import {useMock} from '../Profile/ProfileControl'
import {goToSubscription} from '../Profile/subscriptionNav'
import {
  FileDownloadOutlined as FileDownloadIcon,
  LockOutlined as LockIcon,
} from '@mui/icons-material'


/**
 * "Export" section of the Share dialog: download the current model as a
 * standalone `.glb`, sold as a Pro feature.
 *
 * It lives in the Share dialog because that dialog is already "what leaves
 * this browser", and a toolbar button would cost chrome on mobile.
 *
 * Three gated states resolve in this order (design/new/glb-export-premium.md
 * §4.4): no artifact yet beats everything (there is nothing to download);
 * then anonymous → the login dialog; then free → the subscription flow; then
 * Pro → the export itself. The tier check here is `getTier`, the same
 * mapping the server uses, but it decides only what is RENDERED — the
 * `pro-module` function re-checks the subscription on every request and is
 * the authority.
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
  const {isExporting, run} = useExport()
  const theme = useTheme()

  const isPro = getTier(appMetadata, isAuthenticated) === TIERS.PAID
  // The loader publishes this once the artifact is actually in OPFS — on a
  // cache miss when the writer finishes, on a cache hit right away.
  const isArtifactReady = Boolean(glbArtifact)

  let label = 'Download GLB'
  if (isExporting) {
    label = 'Exporting…'
  } else if (!isArtifactReady) {
    label = 'Preparing GLB…'
  }

  const onExportClick = async () => {
    if (!isAuthenticated) {
      gtagEvent('export_gated', {reason: 'anonymous'})
      setIsLoginVisible(true)
      return
    }
    if (!isPro) {
      gtagEvent('export_gated', {reason: 'free'})
      await goToSubscription({
        stripeCustomerId: appMetadata?.stripeCustomerId || null,
        userEmail: appMetadata?.userEmail || '',
        isDay: theme.palette.mode === 'light',
        getAccessTokenSilently,
        useMock,
      })
      return
    }
    await run('glb', {stripBldrsMetadata: !isMetadataIncluded})
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
