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
import BotIcon from '../assets/icons/Bot2.svg'


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
      isDialogDisplayed={openedDialog}
      setIsDialogDisplayed={setIsDialogDisplayed}
      icon={<AutoFixHighOutlinedIcon className='icon-share'/>}
    >
      <ImagineDialog
        isDialogDisplayed={openedDialog}
        setIsDialogDisplayed={setIsDialogDisplayed}
      />
    </ControlButton>
  )
}


/**
 * The ImagineDialog component contain instructions on how to access the bot
 *
 * @property {boolean} isDialogDisplayed Passed to dialog to be controlled
 * @property {Function} setIsDialogDisplayed Passed to dialog to be controlled
 * @return {React.Component}
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
      const ss = takeScreenshot(viewer)
      setScreenshot(ss)
      setImage(ss)
      // how to add to DOM?
    }
  }, [viewer, model, cameraControls])

  const handleClear = () => {
    setPrompt('')
    setIsImagineLoading(false)
    const ss = takeScreenshot(viewer)
    setScreenshot(ss)
    setImage(ss)
  }

  return (
    <Dialog
      headerIcon={<BotIcon className='icon-share' style={{height: '50px'}}/>}
      headerText={'Imagine'}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
    >
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
    </Dialog>
  )
}


/**
 * @param {object} viewer
 * @return {string} pngUrl
 */
function takeScreenshot(viewer) {
  const glCtx = viewer.context.renderer.renderer.getContext()
  const width = glCtx.drawingBufferWidth
  const height = glCtx.drawingBufferHeight
  const bytesPerPixel = 4
  const pixels = new Uint8Array(width * height * bytesPerPixel)
  glCtx.readPixels(0, 0, width, height, glCtx.RGBA, glCtx.UNSIGNED_BYTE, pixels)

  // Create a 2D canvas to put the image
  const canvas2d = document.createElement('canvas')
  canvas2d.width = width
  canvas2d.height = height
  const context = canvas2d.getContext('2d')

  const dataArr = []
  for (let y = 0; y < height; ++y) {
    for (let x = 0; x < width; ++x) {
      const offset = ((y * width) + x) * bytesPerPixel
      const srcOffset = (((height - y - 1) * width) + x) * bytesPerPixel
      for (let i = 0; i < bytesPerPixel; ++i) {
        dataArr[offset + i] = pixels[srcOffset + i]
      }
    }
  }

  const imageData = context.createImageData(width, height)
  imageData.data.set(dataArr)
  context.putImageData(imageData, 0, 0)

  // Convert canvas to PNG Data URL
  const pngUrl = canvas2d.toDataURL()

  return pngUrl
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

