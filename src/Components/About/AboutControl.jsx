import React, {useState} from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import * as FirstTime from '../../privacy/firstTime'
import useStore from '../../store/useStore'
import Dialog from '../Dialog'
import {ControlButton} from '../Buttons'
import LogoB from '../../assets/LogoB.svg'
import {Helmet} from 'react-helmet-async'
import PkgJson from '../../../package.json'

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
      variant='rounded'
      icon={
        <Box
          sx={{
            '& svg': {
              'marginTop': '6px',
              'width': '18px',
              '@media (max-width: MOBILE_WIDTH)': {
                marginTop: '2px',
              },
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
        <title>About — Bldrs.ai</title>
      </Helmet>
      <Stack
        spacing={3}
        direction="column"
        justifyContent="center"
        alignItems="center"
      >
        <Stack spacing={0}>
          <Typography variant='body1'>Build every thing together</Typography>
          <Link
            underline="always"
            href='https://github.com/bldrs-ai/Share'
            color='inherit'
            variant='overline'
          >
            github.com/bldrs-ai/Share
          </Link>
        </Stack>
        <Box sx={{padding: '0px 10px', textAlign: 'left'}} elevation={0}>
          <Typography variant={'body1'}>
            Welcome to Share.<br/>
            Upload your IFC model,
            position the camera, select elements and crop the model using section planes;
            share the exact view using generated link.
            With Share everyone has access to the same context in model space.<br/>
            You can reach us on{' '}
            <Link href='https://discord.com/channels/853953158560743424/853953158560743426' color='inherit' variant='overline'>
              discord
            </Link>.
          </Typography>
          {
            // TODO(pablo): re-enable after freeze bug fixed.
            // <PrivacyControl/>
          }
        </Box>
      </Stack>
    </Box>)
}
