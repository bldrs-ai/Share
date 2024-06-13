import React, {ReactElement} from 'react'
import {Helmet} from 'react-helmet-async'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'
import {TooltipIconButton} from '../Buttons'
import Dialog from '../Dialog'
import {LogoBWithDomain} from '../Logo/Logo'
// TODO(pablo): re-enable after prod freeze bug fixed
// import PrivacyControl from './PrivacyControl'
// import LinkedInIcon from '@mui/icons-material/LinkedIn'
import GitHubIcon from '@mui/icons-material/GitHub'
// import TwitterIcon from '@mui/icons-material/Twitter'
import DiscordIcon from '../../assets/icons/Discord.svg'


/**
 * The AboutDialog component
 *
 * @property {boolean} isDialogDisplayed Passed to Dialog to be controlled
 * @property {Function} setIsDialogDisplayed Passed to Dialog to be controlled
 * @property {Function} onClose Callback when closed
 * @return {ReactElement}
 */
export default function AboutDialog({isDialogDisplayed, setIsDialogDisplayed, onClose}) {
  return (
    <Dialog
      headerIcon={null}
      headerText={
        (
          <Stack spacing={3} sx={{marginTop: '20px'}}>
            <Link href='/'>
              <LogoBWithDomain/>
            </Link>
            <Typography variant='overline'>
              Build every thing together
            </Typography>
          </Stack>
        )
      }
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      actionTitle='OK'
      actionCb={onClose}
      data-testid='about-dialog'
    >
      <AboutContent/>
    </Dialog>
  )
}


/** @return {ReactElement} */
function AboutContent() {
  const theme = useTheme()
  return (
    <>
      <Helmet>
        <title>About — bldrs.ai</title>
      </Helmet>
      <Stack
        spacing={2}
        direction='column'
        justifyContent='center'
        alignItems='center'
      >
        <Stack spacing={0} direction='row'>
          <TooltipIconButton
            title='Discord'
            onClick={() => window.open(`https://discord.gg/9SxguBkFfQ`, '_blank')}
            icon={<DiscordIcon className='icon-share' style={{width: '100px', color: theme.palette.primary.sceneHighlight}}/>}
            placement='bottom'
            variant='noBackground'
          />
          <TooltipIconButton
            title='GitHub'
            onClick={() => window.open(`https://github.com/bldrs-ai/Share`, '_blank')}
            icon={<GitHubIcon className='icon-share' style={{color: theme.palette.primary.sceneHighlight}}/>}
            placement='bottom'
            variant='noBackground'
          />
        </Stack>
        <Stack align='left' >
          <Typography variant='overline' sx={{lineHeight: '1.9em'}}>
            Welcome to Share, we aim to make sharing IFCs an absolute delight.
            Share is built on top of Bldrs Engine and tightly integrates with GitHub for collaboration and versioning.
            <br/>
            We can open IFC and STEP files.
            <br/>
            Open Dialog contains projects to sample.
            <br/>
            <Typography variant='overline' sx={{ineHeight: '1.4em'}}>Try magic wand for Ai rendering.</Typography>
          </Typography>
        </Stack>
      </Stack>
    </>)
}
