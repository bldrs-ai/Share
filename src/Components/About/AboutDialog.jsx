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
            <Typography variant={'body1'}>
              Build every thing together
            </Typography>
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
        spacing={2}
        direction='column'
        justifyContent='center'
        alignItems='center'
        sx={{maxWidth: '24em'}}
      >
        <Stack spacing={0} direction='row'>
          <TooltipIconButton
            title='Discord'
            onClick={() => window.open(`https://discord.gg/9SxguBkFfQ`, '_blank')}
            icon={<DiscordIcon className='icon-social' style={{width: '50px'}}/>}
            placement='bottom'
            variant='noBackground'
          />
          <TooltipIconButton
            title='GitHub'
            onClick={() => window.open(`https://github.com/bldrs-ai/Share`, '_blank')}
            icon={<GitHubIcon className='icon-social' color='primary'/>}
            placement='bottom'
            variant='noBackground'
          />
        </Stack>
        <Stack align='left' sx={{padding: '0 1em 1em 1em'}}>
          <Typography variant='body2'>
           <b>Welcome</b>
           <br/>
           We are a small team of technologists,<br/> building an <Link>open source</Link> ecosystem in AEC.
           <br/>
           <br/>
           <b>Bldrs Conway</b> is a high performance graphics engine designed to service IFC and STEP files.
           <br/>
           <br/>
           <b>Bldrs Share</b> is a workspace built on top of Conway engine and tightly integrates with{' '}
           Github for collaboration and versioning.
           <br/>
           <br/>
           <b>Bldrs Bot</b> creates text to image model based renderings in Share based on IFC models.
           <br/>
           <br/>
           <b>
            <Link
            href='https://bldrs.ai/share/v/p/index.ifc#c:-133.022,131.828,161.85,-38.078,22.64,-2.314;open:'
            target="_blank"
            >
            {' '}Open dialog{' '}
            </Link>
            contains models to sample.
           </b>
           <br/>
          </Typography>
        </Stack>
      </Stack>
    </>)
}
