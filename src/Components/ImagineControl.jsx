import React, {createRef, useEffect, useState} from 'react'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
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
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import BotIcon from '../assets/icons/Bot.svg'


/**
 * This button hosts the ImagineDialog component and toggles it open and
 * closed.
 *
 * @return {React.ReactElement} The button react component, with a hosted
 *   ShareDialog component
 */
export default function ImagineControl() {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
  const openedDialog = !!isDialogDisplayed


  return (
    <ControlButton
      title='Bldr Bot Rendering'
      icon={<AutoFixHighIcon className='icon-share' color='secondary'/>}
      isDialogDisplayed={openedDialog}
      setIsDialogDisplayed={setIsDialogDisplayed}
      dialog={
        <ImagineDialog
          isDialogDisplayed={openedDialog}
          setIsDialogDisplayed={setIsDialogDisplayed}
        />
      }
    />
  )
}


/**
 * The ImagineDialog component contain instructions on how to access the bot.
 *
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @return {React.Component} The react component
 */
function ImagineDialog({isDialogDisplayed, setIsDialogDisplayed}) {
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

  const handleCopyClick = async () => {
    await navigator.clipboard.writeText(window.location.href)
    // You can add some state or UI feedback to show that the link has been copied
  }


  return (
    <Dialog
      icon={<AutoFixHighIcon className='icon-share'/>}
      headerText={
        <Box sx={{display: 'inline-flex', flexDirection: 'column', textAlign: 'center', height: '120px', marginTop: '10px'}}>
          <BotIcon/>
          <Typography variant={'overline'}>Bldr Bot</Typography>
        </Box>
      }
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={closeDialog}
      actionTitle='Access the bot'
      actionIcon={<CopyIcon className='icon-share'/>}
      actionCb={onCopy}
      content={
        <Stack
          alignItems='center'
          justifyContent='flex-start'
          spacing={0}
          sx={{
            width: '266px',
            marginBottom: '4px',
          }}
        >
          <Helmet>
            <title>BLDR Bot</title>
          </Helmet>
          <Stack
            spacing={1}
            sx={{textAlign: 'left', width: '240px'}}
          >
            <Typography variant={'body1'}>
              Bldr Bot runs on our Discord.
              <br/>
              To join our server please follow {' '}
              <Link
                underline="always"
                href='https://discord.gg/fY9Pa3DD'
                color='inherit'
                variant='overline'
              >
                  the Invite Link
              </Link>
            </Typography>
            <Typography component="div">
              To access the bot:
              <ul style={{marginTop: '6px', padding: '0px', paddingLeft: '30px'}}>
                <li>Copy the link</li>
                <li>Click Access the Bot</li>
                <li>Enter /imagine command</li>
                <li>Give an imaginative prompt!</li>
              </ul>
            </Typography>
          </Stack>
          <TextField
            sx={{
              width: '246px',
            }}
            value={String(window.location)}
            inputRef={urlTextFieldRef}
            variant='outlined'
            size='small'
            rows={1}
            InputProps={{
              readOnly: true,
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={handleCopyClick}
                    edge="end"
                    size='small'
                  >
                    <ContentCopyIcon size='inherit' color='primary' sx={{width: '16px', height: '16px'}}/>
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </Stack>
      }
    />)
}
