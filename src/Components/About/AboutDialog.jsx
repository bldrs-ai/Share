import React, {ReactElement} from 'react'
import {Helmet} from 'react-helmet-async'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import {TooltipIconButton} from '../Buttons'
import Dialog from '../Dialog'
import {LogoBWithDomain} from '../Logo/Logo'
// TODO(pablo): re-enable after prod freeze bug fixed
// import PrivacyControl from './PrivacyControl'
import GitHubIcon from '@mui/icons-material/GitHub'
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
        <Stack spacing={0} direction='row'>
          <TooltipIconButton
            title='Discord'
            onClick={() => window.open(`https://discord.gg/9SxguBkFfQ`, '_blank')}
            icon={<DiscordIcon className='icon-share' style={{width: '50px'}}/>}
            placement='bottom'
            variant='noBackground'
          />
          <TooltipIconButton
            title='GitHub'
            onClick={() => window.open(`https://github.com/bldrs-ai/Share`, '_blank')}
            icon={<GitHubIcon className='icon-share'/>}
            placement='bottom'
            variant='noBackground'
          />
        </Stack>
        <Stack align='left'>
          <Typography variant='body1'>
            Upload your IFC model, position the camera, select elements,
            crop the model using section planes and add notes; then share
            the exact view using the generated link. Everyone has access
            to the same context in model space.
          </Typography>
          <Typography variant='body1'>
            &nbsp;<br/>
            And try the magic wand!
          </Typography>
        </Stack>
      </Stack>
    </>)
}
