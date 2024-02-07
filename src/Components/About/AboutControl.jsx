import React, {useState} from 'react'
import {Helmet} from 'react-helmet-async'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import * as FirstTime from '../../privacy/firstTime'
import Dialog from '../Dialog'
import {ControlButton, TooltipIconButton} from '../Buttons'
import {LogoB, LogoBWithDomain} from '../Logo/Logo'
import PkgJson from '../../../package.json'
// TODO(pablo): re-enable after prod freeze bug fixed
// import PrivacyControl from './PrivacyControl'
import LinkedInIcon from '@mui/icons-material/LinkedIn'
import GitHubIcon from '@mui/icons-material/GitHub'
import TwitterIcon from '@mui/icons-material/Twitter'
import DiscordIcon from '../../assets/icons/Discord.svg'


/**
 * Button to toggle About panel on and off
 *
 * @return {React.ReactElement}
 */
export default function AboutControl() {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(FirstTime.isFirst())

  return (
    <ControlButton
      icon={<LogoB/>}
      title={`Bldrs: ${PkgJson.version}`}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      variant='noBackground'
      sx={{
        position: 'fixed',
        left: '1em',
        bottom: '1em',
      }}
    >
      <AboutDialog
        isDialogDisplayed={isDialogDisplayed}
        setIsDialogDisplayed={setIsDialogDisplayed}
        onClose={() => {
          setIsDialogDisplayed(false)
          FirstTime.setVisited()
        }}
      />
    </ControlButton>
  )
}


/**
 * The AboutDialog component
 *
 * @property {boolean} isDialogDisplayed Passed to Dialog to be controlled
 * @property {Function} setIsDialogDisplayed Passed to Dialog to be controlled
 * @property {boolean} onClose Callback when closed
 * @return {React.ReactElement} React component
 */
export function AboutDialog({isDialogDisplayed, setIsDialogDisplayed, onClose}) {
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
    >
      <AboutContent/>
    </Dialog>
  )
}


/** @return {React.ReactElement} */
function AboutContent() {
  return (
    <Box sx={{paddingBottom: '10px'}}>
      <Helmet>
        <title>About — Bldrs.ai</title>
      </Helmet>
      <Stack
        spacing={3}
        direction="column"
        justifyContent="center"
        alignItems="center"
      >
        <Stack spacing={2} direction={'row'}>
          <TooltipIconButton
            title={'Discord'}
            onClick={
              () => {
                window.open(`https://discord.gg/9SxguBkFfQ`, '_blank')
              }
            }
            icon={<DiscordIcon className='icon-share' style={{width: '50px'}}/>}
            placement={'bottom'}
            variant='noBackground'
          />
          <TooltipIconButton
            title={'Twitter'}
            onClick={
              () => {
                window.open(`https://twitter.com/bldrs_ai`, '_blank')
              }
            }
            icon={<TwitterIcon className='icon-share'/>}
            placement={'bottom'}
            variant='noBackground'
          />
          <TooltipIconButton
            title={'LinkedIn'}
            onClick={
              () => {
                window.open(`https://www.linkedin.com/company/bldrs-ai/`, '_blank')
              }
            }
            icon={<LinkedInIcon className='icon-share'/>}
            placement={'bottom'}
            variant='noBackground'
          />
          <TooltipIconButton
            title={'GitHub'}
            onClick={
              () => {
                window.open(`https://github.com/bldrs-ai/Share`, '_blank')
              }
            }
            icon={<GitHubIcon className='icon-share'/>}
            placement={'bottom'}
            variant='noBackground'
          />

        </Stack>
        <Box sx={{padding: '0px 10px', textAlign: 'left'}} elevation={0}>
          <Typography variant={'body1'}>
            Upload your IFC model, position the camera, select elements,
            crop the model using section planes and add notes; then share
            the exact view using the generated link. Everyone has access
            to the same context in model space.
          </Typography>
          <Typography variant={'body1'}>
            &nbsp;<br/>
            And try the magic wand!
          </Typography>
        </Box>
      </Stack>
    </Box>)
}
