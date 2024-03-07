import axios from 'axios'
import React, {useEffect, useState} from 'react'
import {Helmet} from 'react-helmet-async'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Box from '@mui/material/Box'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import {RectangularButton} from '../Components/Buttons'
import useStore from '../store/useStore'
import debug from '../utils/debug'
import {ControlButton} from './Buttons'
import {
  addCameraUrlParams,
} from './CameraControl'
import Dialog from './Dialog'
import Loader from './Loader'
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined'
import ClearIcon from '@mui/icons-material/Clear'
import BotIcon4 from '../assets/icons/Bot2.svg'
import CopyIcon from '../assets/icons/Copy.svg'


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
      title='AI Renderings'
      icon={<AutoFixHighOutlinedIcon className='icon-share' color='secondary'/>}
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
 * @param {number} botIconIndex The current index of the bot icon which is kept track of in the wrapper component
 * @return {React.Component} The react component
 */
function ImagineDialog({
  isDialogDisplayed,
  setIsDialogDisplayed,
}) {
  const [prompt, setPrompt] = useState('')
  const [screenshot, setScreenshot] = useState(null)
  const [isImagineLoading, setIsImagineLoading] = useState(false)
  const [imagine, setImagine] = useState(null)
  const [image, setImage] = useState(null)
  const cameraControls = useStore((state) => state.cameraControls)
  const viewer = useStore((state) => state.viewer)
  const model = useStore((state) => state.model)

  useEffect(() => {
    if (viewer) {
      addCameraUrlParams(cameraControls)
      const ss = viewer.takeScreenshot()
      setScreenshot(ss)
      setImage(ss)
    }
  }, [viewer, model, cameraControls])

  const closeDialog = () => {
    setIsDialogDisplayed(false)
  }

  const handleClear = () => {
    setPrompt('')
    setIsImagineLoading(false)
    const ss = viewer.takeScreenshot()
    setScreenshot(ss)
    setImage(ss)
  }

  return (
    <Dialog
      icon={<AutoFixHighOutlinedIcon className='icon-share'/>}
      headerText={<BotIcon4 style={{height: '60px'}}/>}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={closeDialog}
      actionTitle='Close'
      actionIcon={<CopyIcon className='icon-share'/>}
      actionCb={closeDialog}
      hideActionButton={true}
      content={
        <>
          <Helmet>
            <title>Bot the Bldr</title>
          </Helmet>
          <Stack
            spacing={2}
            justifyContent={'center'}
            alignContent={'center'}
            sx={{minHeight: '390px'}}
          >

            <Box
              sx={{
                minHeight: '390px',
                borderRadius: '10px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'}}
            >
              {isImagineLoading &&
                <Loader type='circular'/>
              }
              {!isImagineLoading && image &&
               <img
                 src={image}
                 alt='Imagine'
                 height={'390px'}
               />}
            </Box>

            <TextField
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              fullWidth
              multiline
              size='small'
              placeholder={'Imagine prompt'}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    {prompt && (
                      <IconButton
                        aria-label="clear text"
                        onClick={handleClear}
                        edge="end"
                        size="small"
                      >
                        <ClearIcon size='inherit'/>
                      </IconButton>
                    )}
                  </InputAdornment>
                ),
              }}
            />
            <Stack
              spacing={2}
              direction={'row'}
              justifyContent={'center'}
              alignContent={'center'}
            >
              <RectangularButton
                title={'Create'}
                disabled={prompt.length === 0}
                onClick={() => {
                  setIsImagineLoading(true)
                  sendToWarhol(screenshot, prompt, (renderDataUrl) => {
                    setIsImagineLoading(false)
                    setImagine(renderDataUrl)
                    setImage(renderDataUrl)
                  })
                }}
              />
              <RectangularButton
                title={'Download'}
                disabled={imagine === null}
                onClick={() => {
                  downloadImaginePng(imagine)
                }}
              />
            </Stack>
          </Stack>
        </>
      }
    />)
}


/**
 * @param {string} dataUrl The screenshot
 */
function sendToWarhol(dataUrl, prompt, onReady) {
  const base64Content = dataUrl.split(',')[1]

  const req = {
    prompt: prompt,
    negative_prompt: 'people',
    batch_size: 1,
    steps: 30,
    cfg_scale: 7,
    seed: 1234,
    image: base64Content,
  }

  axios
      .post('https://warhol.bldrs.dev/generate', req, {
        headers: {
          'Content-Type': 'application/json',
        },
      })
      .then((response) => {
        const renderDataUrl = `data:image/png;base64,${response.data[0].img}`
        onReady(renderDataUrl)
      })
      .catch((error) => {
        debug().error('Error uploading screenshot:', error)
      })
}


/**
 * Opens save dialog in user's browser to save the dataUrl
 *
 * @param {string} dataUrl
 */
function downloadImaginePng(dataUrl) {
  // Optional: Display the PNG in an image tag
  const img = document.createElement('img')
  img.src = dataUrl
  document.body.appendChild(img)

  // Optional: Download the PNG
  const downloadLink = document.createElement('a')
  downloadLink.href = dataUrl
  downloadLink.download = 'imagine.png'
  downloadLink.click()
}

