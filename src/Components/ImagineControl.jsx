import React, {createRef, useEffect, useState} from 'react'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import useStore from '../store/useStore'
import Dialog from './Dialog'
import {
  addCameraUrlParams,
} from './CameraControl'
import {ControlButton} from './Buttons'
import CopyIcon from '../assets/icons/Copy.svg'
import {Helmet} from 'react-helmet-async'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'


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
      title='Imagine AI rendering'
      icon={<AutoFixHighIcon className='icon-share'/>}
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
  const cameraControls = useStore((state) => state.cameraControls)
  const viewer = useStore((state) => state.viewer)
  const model = useStore((state) => state.model)
  const urlTextFieldRef = createRef()


  useEffect(() => {
    if (viewer) {
      addCameraUrlParams(cameraControls)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, model])


  const closeDialog = () => {
    setIsDialogDisplayed(false)
  }

  const onCopy = async (event) => {
    await navigator.clipboard.writeText(window.location.href)
    window.open('https://discord.com/channels/853953158560743424/1126526910495740005', '_blank')
    urlTextFieldRef.current.select()
    closeDialog()
  }


  return (
    <Dialog
      icon={<AutoFixHighIcon className='icon-share'/>}
      headerText='AI rendering'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={closeDialog}
      actionTitle='Copy Link and go to Discord'
      actionIcon={<CopyIcon className='icon-share'/>}
      actionCb={onCopy}
      content={
        <Stack
          alignItems='center'
          justifyContent='flex-start'
          spacing={1}
          sx={{
            width: '300px',
          }}
        >
          <Helmet>
            <title>AI rendering</title>
          </Helmet>
          <Stack
            spacing={1}
          >
            <Typography variant={'body1'}>
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
            <Typography variant={'body1'}>
              To use it is please go to discord channel, type /imagine and follow the intstructions.
            </Typography>
          </Stack>
          <TextField
            sx={{
              width: '266px',
            }}
            value={String(window.location)}
            inputRef={urlTextFieldRef}
            variant='outlined'
            size='small'
            rows={1}
            InputProps={{
              readOnly: true,
            }}
          />
        </Stack>
      }
    />)
}
