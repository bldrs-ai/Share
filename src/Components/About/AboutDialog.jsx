import React, {ReactElement} from 'react'
import {Helmet} from 'react-helmet-async'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Dialog from '../Dialog'
import {LogoBWithDomain} from '../Logo/Logo'
// TODO(pablo): re-enable after prod freeze bug fixed
// import PrivacyControl from './PrivacyControl'
import GitHubIcon from '@mui/icons-material/GitHub'
import EmailIcon from '@mui/icons-material/Email'
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
          <>
            <Link href='/'>
              <LogoBWithDomain/>
            </Link>
            Build every thing together
          </>
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
  return (
    <>
      <Helmet>
        <title>About — bldrs.ai</title>
      </Helmet>
      <Stack
        spacing={3}
        direction='column'
        justifyContent='center'
        alignItems='center'
      >
        <Stack align='left' spacing={2}>
          <Typography variant='body1'>
            Welcome to Bldrs - Share!
          </Typography>
          <Typography variant='body1'>
            Use the Open dialog to open IFC or STEP models from:
            <ul>
              <li>Local files - <em>no data is uploaded to our servers</em></li>
              <li>Files hosted on GitHub, public or private</li>
            </ul>
          </Typography>
          <Typography variant='body1'>
            Position the camera, Select elements, Crop using section planes and
            add Notes.  For files on GitHub Share the exact view using the page URL or
            Share dialog.
          </Typography>
          <Typography variant='body1'>
            Comments and suggestions welcome!
          </Typography>
          <Stack direction='row' justifyContent='center' alignItems='center' spacing={2}>
            <a href="https://discord.gg/9SxguBkFfQ">
              <DiscordIcon className='icon-share' style={{height: '0.7em', marginRight: '0.5em'}}/>Discord
            </a>
            <a href="https://github.com/bldrs-ai/Share">
              <GitHubIcon className='icon-share' style={{height: '0.7em', marginRight: '0.25em'}}/>GitHub
            </a>
            <a href="mailto:info@bldrs.ai">
              <EmailIcon className='icon-share' style={{height: '0.7em', marginRight: '0.25em'}}/>info@bldrs.ai
            </a>
          </Stack>
        </Stack>
      </Stack>
    </>)
}
