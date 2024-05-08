import axios from 'axios'
import React, {ReactElement, useEffect, useState} from 'react'
import {Helmet} from 'react-helmet-async'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Box from '@mui/material/Box'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import useStore from '../../store/useStore'
import debug from '../../utils/debug'
import {ControlButtonWithHashState, RectangularButton} from '../Buttons'
import Dialog from '../Dialog'
import Loader from '../Loader'
import {HASH_PREFIX_IMAGINE} from './hashState'
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined'
import ClearIcon from '@mui/icons-material/Clear'
import BotIcon from '../../assets/icons/Bot2.svg'


/**
 * This button hosts the ImagineDialog component and toggles it open and
 * closed.
 *
 * @return {ReactElement}
 */
export default function ImagineControl() {
  const isImagineVisible = useStore((state) => state.isImagineVisible)
  const setIsImagineVisible = useStore((state) => state.setIsImagineVisible)
  return (
    <ControlButtonWithHashState
      title='Rendering'
      icon={<AutoFixHighOutlinedIcon className='icon-share'/>}
      isDialogDisplayed={isImagineVisible}
      setIsDialogDisplayed={setIsImagineVisible}
      hashPrefix={HASH_PREFIX_IMAGINE}
      placement='left'
    >
      <ImagineDialog
        isDialogDisplayed={isImagineVisible}
        setIsDialogDisplayed={setIsImagineVisible}
      />
    </ControlButtonWithHashState>
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
  const viewer = useStore((state) => state.viewer)

  const [prompt, setPrompt] = useState('')
  const [screenshot, setScreenshot] = useState(null)
  const [isImagineLoading, setIsImagineLoading] = useState(false)
  const [imagine, setImagine] = useState(null)
  const [image, setImage] = useState(null)

  const [finalPrompt, setFinalPrompt] = useState(null)

  useEffect(() => {
    if (viewer && isDialogDisplayed) {
      // Clear out possible prior state
      setPrompt('')
      setFinalPrompt(null)
      setIsImagineLoading(false)
      const ss = viewer.takeScreenshot()
      setScreenshot(ss)
      setImage(ss)
    }
  }, [isDialogDisplayed, viewer])


  const onCreateClick = () => {
    setFinalPrompt(prompt)
    setIsImagineLoading(true)
    sendToWarhol(screenshot, prompt, (renderDataUrl) => {
      setIsImagineLoading(false)
      setImagine(renderDataUrl)
      setImage(renderDataUrl)
    })
  }

  const onClearClick = () => {
    setPrompt('')
    setFinalPrompt(null)
    setIsImagineLoading(false)
    const ss = viewer.takeScreenshot()
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
      <Helmet><title>{finalPrompt ? `Imagine: ${finalPrompt}` : 'Imagine'}</title></Helmet>
      <Stack
        sx={{minHeight: '390px'}}
      >
        <Box
          sx={{
            minHeight: '390px',
            borderRadius: '10px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {isImagineLoading && <Loader type='circular'/>}
          {!isImagineLoading && image &&
           <img
             src={image}
             alt='Imagine'
             height='390px'
             data-testid='img-rendered'
           />}
        </Box>

        <Stack>
          <TextField
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            fullWidth
            multiline
            size='small'
            placeholder='Imagine prompt'
            data-testid='text-field-render-description'
            InputProps={{
              endAdornment: (
                <InputAdornment position='end'>
                  {prompt && (
                    <IconButton
                      aria-label='clear text'
                      onClick={onClearClick}
                      edge='end'
                      size='small'
                    >
                      <ClearIcon size='inherit'/>
                    </IconButton>
                  )}
                </InputAdornment>
              ),
            }}
          />
          <Stack direction='row' spacing={1} justifyContent='center'>
            <RectangularButton
              title='Create'
              onClick={onCreateClick}
              disabled={prompt.length === 0}
            />
            <RectangularButton
              title='Download'
              onClick={() => downloadImaginePng(imagine)}
              disabled={imagine === null}
            />
          </Stack>
        </Stack>
      </Stack>
    </Dialog>
  )
}


/** @param {string} dataUrl The screenshot */
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

