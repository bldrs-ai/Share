import React, {useState} from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import * as FirstTime from '../../privacy/firstTime'
import useStore from '../../store/useStore'
import Dialog from '../Dialog'
import {ControlButton, TooltipIconButton} from '../Buttons'
// TODO(pablo): re-enable after prod freeze bug fixed
// import PrivacyControl from './PrivacyControl'
import LogoB from '../../assets/LogoB.svg'
import {Helmet} from 'react-helmet-async'
import PkgJson from '../../../package.json'
import LinkedInIcon from '@mui/icons-material/LinkedIn'
import GitHubIcon from '@mui/icons-material/GitHub'
import TwitterIcon from '@mui/icons-material/Twitter'
import DiscordIcon from '../../assets/icons/Discord.svg'


/**
 * Button to toggle About panel on and off
 *
 * @return {React.Component}
 */
export default function AboutControl() {
  const isAboutDialogSuppressed = useStore((state) => state.isAboutDialogSuppressed)
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(FirstTime.isFirst())
  const setIsDialogDisplayedLocal = (value) => {
    setIsDialogDisplayed(value)
  }

  const setIsDialogDisplayedForDialog = () => {
    setIsDialogDisplayed(false)
    FirstTime.setVisited()
  }

  return (
    <ControlButton
      title={`Bldrs: ${PkgJson.version}`}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayedLocal}
      variant='noBackground'
      icon={
        <Box
          sx={{
            '& svg': {
              marginTop: '6px',
              width: '18px',
            },
          }}
        >
          <LogoB/>
        </Box>
      }
      dialog={
        <AboutDialog
          isDialogDisplayed={isAboutDialogSuppressed ? false : isDialogDisplayed}
          setIsDialogDisplayed={setIsDialogDisplayedForDialog}
        />
      }
    />
  )
}


/**
 * The AboutDialog component
 *
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @return {React.ReactElement} React component
 */
export function AboutDialog({isDialogDisplayed, setIsDialogDisplayed}) {
  return (
    <Dialog
      headerText={
        <Box sx={{display: 'inline-flex', flexDirection: 'column', textAlign: 'center', height: '90px'}}>
          <LogoB/>
          <Link
            href='/'
            color='inherit'
            sx={{textDecoration: 'none'}}
          >
            <Typography variant={'overline'}>bldrs.ai</Typography>
          </Link>
        </Box>
      }
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      content={<AboutContent setIsDialogDisplayed={setIsDialogDisplayed}/>}
      actionTitle='OK'
      actionCb={() => setIsDialogDisplayed(false)}
    />
  )
}


/**
 * The content portion of the AboutDialog
 *
 * @return {React.ReactElement} React component
 */
function AboutContent({setIsDialogDisplayed}) {
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
        <Stack spacing={0}>
          <Typography variant='body1'>
              Build every thing together
          </Typography>
        </Stack>
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
            dataTestId=''
          />
          <TooltipIconButton
            title={'Twitter'}
            onClick={
              () => {
                window.open(`https://twitter.com/bldrs_ai`, '_blank')
              }
            }
            icon={<TwitterIcon className='icon-share' color='secondary'/>}
            placement={'bottom'}
            dataTestId='twitter'
          />
          <TooltipIconButton
            title={'LinkedIn'}
            onClick={
              () => {
                window.open(`https://www.linkedin.com/company/bldrs-ai/`, '_blank')
              }
            }
            icon={<LinkedInIcon className='icon-share' color='secondary'/>}
            placement={'bottom'}
            dataTestId=''
          />
          <TooltipIconButton
            title={'GitHub'}
            onClick={
              () => {
                window.open(`https://github.com/bldrs-ai/Share`, '_blank')
              }
            }
            icon={<GitHubIcon className='icon-share' color='secondary'/>}
            placement={'bottom'}
            dataTestId='github'
          />

        </Stack>
        <Box sx={{padding: '0px 10px', textAlign: 'left'}} elevation={0}>
          <Typography variant={'body1'}>
          Upload your IFC model, position the camera, select elements, crop the model using section planes and add notes;
          then share the exact view using the generated link.
          Everyone has access to the same context in model space.
          </Typography>
          <Typography variant={'body1'}>
            &nbsp;<br/>
            And try the magic wand!
          </Typography>
        </Box>
      </Stack>
    </Box>)
}
