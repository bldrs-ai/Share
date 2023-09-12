import React, {useState} from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import {getCookieBoolean, setCookieBoolean} from '../../privacy/Privacy'
import useStore from '../../store/useStore'
import Dialog from '../Dialog'
import {ControlButton} from '../Buttons'
import PrivacyControl from './PrivacyControl'
import AboutIcon from '../../assets/icons/Information.svg'
import LogoB from '../../assets/LogoB.svg'
import {Helmet} from 'react-helmet-async'


/**
 * Button to toggle About panel on and off
 *
 * @return {React.Component}
 */
export default function AboutControl() {
  const isAboutDialogSuppressed = useStore((state) => state.isAboutDialogSuppressed)
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(getCookieBoolean({
    component: 'about',
    name: 'isFirstTime',
    defaultValue: true,
  }))
  const setIsDialogDisplayedLocal = (value) => {
    setIsDialogDisplayed(value)
  }

  const setIsDialogDisplayedForDialog = () => {
    setIsDialogDisplayed(false)
    setCookieBoolean({component: 'about', name: 'isFirstTime', value: false})
  }

  return (
    <ControlButton
      title='About'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayedLocal}
      icon={
        <AboutIcon className='icon-share'/>
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
        <Box sx={{display: 'inline-flex', flexDirection: 'column', textAlign: 'center'}}>
          <LogoB/>
          <Typography variant={'overline'}>bldrs.ai</Typography>
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
        <title>About — BLDRS</title>
      </Helmet>
      <Stack
        spacing={3}
        direction="column"
        justifyContent="center"
        alignItems="center"
      >
        <Stack spacing={0}>
          <Typography variant={'body1'}>build every thing together</Typography>
          <Link
            underline="always"
            href='https://github.com/bldrs-ai/Share'
          >
            github.com/bldrs-ai/Share
          </Link>
        </Stack>
        <Box sx={{padding: '0px 10px', textAlign: 'left'}} elevation={0}>
          <Typography variant={'body1'}>
            <Box variant='span'>
              Welcome to Share.
            </Box>
            Highlight specific elements within your 3D model,
            position the camera angle,
            share the exact view using generated link.
            <Box variant='span' sx={{fontWeight: 'bold'}}>
              With the Share link everyone has access to the same context in digital space.
            </Box>
          </Typography>
        </Box>
        <PrivacyControl/>
      </Stack>
    </Box>)
}
