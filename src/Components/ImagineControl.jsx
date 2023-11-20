import React, {createRef, useEffect, useState} from 'react'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import Stack from '@mui/material/Stack'
import useStore from '../store/useStore'
import Dialog from './Dialog'
import {
  addCameraUrlParams,
  removeCameraUrlParams,
} from './CameraControl'
import {ControlButton} from './Buttons'
import CopyIcon from '../assets/icons/Copy.svg'
import {Helmet} from 'react-helmet-async'
import AiIcon from '../assets/icons/AI.svg'


/**
 * This button hosts the ShareDialog component and toggles it open and
 * closed.
 *
 * @return {React.ReactElement} The button react component, with a hosted
 *   ShareDialog component
 */
export default function ShareControl() {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
  const openedDialog = !!isDialogDisplayed


  return (
    <ControlButton
      title='Ai imagine rendering'
      icon={<AiIcon className='icon-share'/>}
      isDialogDisplayed={openedDialog}
      setIsDialogDisplayed={setIsDialogDisplayed}
      dialog={
        <ShareDialog
          isDialogDisplayed={openedDialog}
          setIsDialogDisplayed={setIsDialogDisplayed}
        />
      }
    />
  )
}


/**
 * The ShareDialog component lets the user control what state is
 * included in the shared URL and assists in copying the URL to
 * clipboard.
 *
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @return {React.Component} The react component
 */
function ShareDialog({isDialogDisplayed, setIsDialogDisplayed}) {
  const [isCameraInUrl] = useState(true)
  const cameraControls = useStore((state) => state.cameraControls)
  const viewer = useStore((state) => state.viewer)
  const model = useStore((state) => state.model)
  const urlTextFieldRef = createRef()


  useEffect(() => {
    if (viewer) {
      if (isCameraInUrl) {
        addCameraUrlParams(cameraControls)
      } else {
        removeCameraUrlParams()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, model])


  const closeDialog = () => {
    setIsDialogDisplayed(false)
  }


  const onCopy = (event) => {
    navigator.clipboard.writeText(location)
    urlTextFieldRef.current.select()
    closeDialog()
    window.open('https://discord.com/channels/853953158560743424/1126526910495740005', '_blank').focus()
  }

  return (
    <Dialog
      icon={<AiIcon className='icon-share'/>}
      headerText='A.I. agent'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={closeDialog}
      actionTitle='Copy link and go discord'
      actionIcon={<CopyIcon className='icon-share'/>}
      actionCb={onCopy}
      content={
        <Stack spacing={1} sx={{width: '230px', height: '120px'}}>
          <Helmet>
            <title>Imagine AI rendering</title>
          </Helmet>
          <Stack
            spacing={1}
            sx={{
              lineHeight: '1.4em',
              textAlign: 'left',
            }}
          >
            <Typography variant={'body1'}
              sx={{
                lineHeight: '1.4em',
              }}
            >
            At the moment our AI agent lives on  {' '}
              <Link
                underline="always"
                href='https://discord.com/channels/853953158560743424/1126526910495740005'
                color='inherit'
                variant='overline'
                sx={{
                  lineHeight: '1.4em',
                }}
              >
            discrord.
              </Link>
            </Typography>
            <Typography variant={'body1'}
              sx={{
                lineHeight: '1.4em',
              }}
            >
              To use it is please go to discord channel type /imagine and follow the intstructions.
            </Typography>
          </Stack>
        </Stack>
      }
    />)
}
