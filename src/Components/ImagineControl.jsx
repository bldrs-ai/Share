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
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined'
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
      icon={<AutoFixHighOutlinedIcon className='icon-share' color='secondary'/>}
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
      icon={<AutoFixHighOutlinedIcon className='icon-share'/>}
      headerText={
        <Box
          sx={{
            display: 'inline-flex',
            flexDirection: 'column',
            textAlign: 'center',
            height: '120px',
            marginTop: '10px'}}
        >
          <CurrentBotIcon/>
          <Typography variant={'overline'}>Bot-the-Bldr</Typography>
        </Box>
      }
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={closeDialog}
      actionTitle='Go to #bot-the-bldr on Bldrs Discord'
      actionIcon={<CopyIcon className='icon-share'/>}
      actionCb={onCopy}
      content={
        <Stack
          alignItems='center'
          justifyContent='flex-start'
          spacing={0}
          sx={{
            marginBottom: '4px',
          }}
        >
          <Helmet>
            <title>BLDR Bot</title>
          </Helmet>
          <Stack
            spacing={1}
            sx={{textAlign: 'left'}}
          >
            <Typography variant={'body1'}>
              Bldr Bot creates realistic images of CAD models using Generative AI.
            </Typography>
            <Typography component="div">
              To use:
              <ol style={{marginTop: '6px', padding: '0px', paddingLeft: '30px', lineHeight: '1.8em'}}>
                <li>Copy this page&apos;s link<br/>
                  <TextField
                    sx={{
                      width: '90%',
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
                </li>
                <li>Click the button below to go to our #bot-the-bldr channel</li>
                <ul>
                  <li>(You first may need to join {' '}
                    <Link
                      underline="always"
                      href='https://discord.gg/fY9Pa3DD'
                      color='inherit'
                    >
                      The Bldrs Discord
                    </Link>)
                  </li>
                </ul>
                <li>When you&apos;re there:
                  <ol>
                    <li>Type {' '}
                      <Typography
                        variant='overline'
                        sx={{fontWeight: 'bold'}}
                      >
                        /imagine
                      </Typography>
                    </li>
                    <li>Paste the link you copied for this model</li>
                    <li>Enter some text like &apos;Model on display in warehouse&apos;</li>
                    <li>Hit Enter and Bldr Bot will imagine your image!</li>
                  </ol>
                </li>
                <li>Experiment with different prompts and share your creations 👨‍🎨</li>
              </ol>
            </Typography>
          </Stack>
        </Stack>
      }
    />)
}
