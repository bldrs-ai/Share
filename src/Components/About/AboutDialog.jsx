import React, {ReactElement} from 'react'
import {Helmet} from 'react-helmet-async'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import SvgIcon from '@mui/material/SvgIcon'
import Typography from '@mui/material/Typography'
import Dialog from '../Dialog'
import {LogoBWithDomain} from '../Logo/Logo'
import {ABOUT_MISSION, ABOUT_PAGE_TITLE} from './component'
// TODO(pablo): re-enable after prod freeze bug fixed
// import PrivacyControl from './PrivacyControl'
import GitHubIcon from '@mui/icons-material/GitHub'
import EmailIcon from '@mui/icons-material/Email'
import DiscordIcon from './Discord.svg'


/**
 * @property {boolean} isDialogDisplayed Passed to Dialog to be controlled
 * @property {Function} setIsDialogDisplayed Passed to Dialog to be controlled
 * @property {Function} onClose Callback when closed
 * @return {ReactElement}
 */
export default function AboutDialog({isDialogDisplayed, setIsDialogDisplayed, onClose}) {
  return (
    <Dialog
      headerText={ABOUT_MISSION}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      headerIcon={
        <Link href='/'>
          <LogoBWithDomain
            sx={{
              width: '144px',
              height: '144px',
            }}
          />
        </Link>
      }
      actionTitle='OK'
      actionCb={onClose}
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
        <title>{ABOUT_PAGE_TITLE}</title>
      </Helmet>
      <Stack
        spacing={3}
        direction='column'
        justifyContent='center'
        alignItems='center'
      >
        <Stack align='left' spacing={2} sx={{width: '100%'}}>
          <Typography variant='body1'>
            Welcome to Bldrs - Share!
          </Typography>
          <div>
            Use the Open dialog to open IFC or STEP models from:
            <ul>
              <li>Local files - <em>Drag &amp; Drop to open; no data is uploaded</em></li>
              <li>Files hosted on GitHub, public or private</li>
              <li>Click the Open folder and check out Sample models</li>
            </ul>
          </div>
          <Typography variant='body1'>
            Position the camera, Select elements, Crop using section planes and
            Collaborate with your team via Notes.  For files on GitHub share the
            exact view using the page URL or Share dialog.
          </Typography>
          <Typography variant='body1'>
            Comments and suggestions welcome!
          </Typography>
          <Stack direction='row' justifyContent='center' alignItems='center' spacing={1}>
            <Link href='https://discord.gg/9SxguBkFfQ' rel='noopener' sx={{display: 'flex', alignItems: 'center'}}>
              <SvgIcon sx={{marginRight: '0.25em'}}><DiscordIcon className='icon-share'/></SvgIcon>Discord
            </Link>
            <Link href='https://github.com/bldrs-ai/Share' rel='noopener' sx={{display: 'flex', alignItems: 'center'}}>
              <GitHubIcon className='icon-share' sx={{marginRight: '0.25em'}}/>GitHub
            </Link>
            <Link href='mailto:info@bldrs.ai' sx={{display: 'flex', alignItems: 'center'}}>
              <EmailIcon className='icon-share' sx={{marginRight: '0.25em'}}/>info@bldrs.ai
            </Link>
          </Stack>
        </Stack>
      </Stack>
    </>)
}
