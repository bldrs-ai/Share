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
        sx={{maxWidth: '22em'}}
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
          <Typography variant='body1'>
           Welcome to Share.
           <br/>
           We aim to make <Link>sharing BIM models</Link> an absolute delight.
           <br/>
           Share is built on top of Bldrs engine and tightly integrates with{' '}
           <Link>Github</Link> for <Link>collaboration</Link> and <Link>versioning</Link>.
           <br/>
           We support IFC and STEP files.
           <br/>
           The <Link>open dialog</Link> contains projects to sample.
           <br/>
           Try <Link>magic wand</Link> for AI rendering.
          </Typography>
        </Stack>
      </Stack>
    </>)
}
