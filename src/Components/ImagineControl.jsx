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
import BotIcon1 from '../assets/icons/Bot1.svg'
import BotIcon2 from '../assets/icons/Bot3.svg'
import BotIcon3 from '../assets/icons/Bot4.svg'
import BotIcon4 from '../assets/icons/Bot2.svg'


/**
 * This button hosts the ImagineDialog component and toggles it open and
 * closed.
 *
 * @return {React.ReactElement} The button react component, with a hosted
 *   ShareDialog component
 */
export default function ImagineControl() {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
  const [botIconIndex, setBotIconIndex] = useState(0)
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
          botIconIndex={botIconIndex} // Pass botIconIndex as a prop
          setBotIconIndex={setBotIconIndex} // Pass setBotIconIndex as a prop
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
 * @param {number} botIconIndex The current index of the bot icon which is kept track of in the wrapper component
 * @param {Function} setBotIconIndex The function to update the botIconIndex
 * @return {React.Component} The react component
 */
function ImagineDialog({isDialogDisplayed, setIsDialogDisplayed, botIconIndex, setBotIconIndex}) {
  const cameraControls = useStore((state) => state.cameraControls)
  const viewer = useStore((state) => state.viewer)
  const model = useStore((state) => state.model)
  const urlTextFieldRef = createRef()
  const botIcons = [BotIcon2, BotIcon3, BotIcon1, BotIcon4]

  useEffect(() => {
    if (viewer) {
      addCameraUrlParams(cameraControls)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, model])

  useEffect(() => {
    if (isDialogDisplayed) {
      setBotIconIndex((prevIndex) => (prevIndex + 1) % botIcons.length)
    }
  }, [isDialogDisplayed, botIcons.length, setBotIconIndex])


  const CurrentBotIcon = botIcons[botIconIndex]


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
  }


  return (
    <Dialog
      icon={<AutoFixHighIcon className='icon-share'/>}
      headerText={
        <Box sx={{display: 'inline-flex', flexDirection: 'column', textAlign: 'center', height: '120px', marginTop: '10px'}}>
          <CurrentBotIcon/>
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
              <ul style={{marginTop: '6px', padding: '0px', paddingLeft: '30px', lineHeight: '1.8em'}}>
                <li>Copy the link</li>
                <li>Click Access the Bot</li>
                <li>Enter <Typography variant='overline' sx={{fontWeight: 'bold'}}>/imagine</Typography> command</li>
                <li>Experiment with prompts!</li>
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
