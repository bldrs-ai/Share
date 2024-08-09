import axios from 'axios'
import React, {ReactElement, useEffect, useState} from 'react'
import {Helmet} from 'react-helmet-async'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Box from '@mui/material/Box'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import {useIsMobile} from '../Hooks'
import useStore from '../../store/useStore'
import debug from '../../utils/debug'
import {RectangularButton} from '../Buttons'
import Dialog from '../Dialog'
import Loader from '../Loader'
import CloseIcon from '@mui/icons-material/Close'
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined'


/**
 * The ImagineDialog component contain instructions on how to access the bot
 *
 * @property {boolean} isDialogDisplayed Passed to dialog to be controlled
 * @property {Function} setIsDialogDisplayed Passed to dialog to be controlled
 * @return {ReactElement}
 */
export default function ImagineDialog({
  isDialogDisplayed,
  setIsDialogDisplayed,
}) {
  const viewer = useStore((state) => state.viewer)
  const isModelReady = useStore((state) => state.isModelReady)

  const [prompt, setPrompt] = useState('')
  const [screenshot, setScreenshot] = useState(null)
  const [isImagineLoading, setIsImagineLoading] = useState(false)
  const [imagine, setImagine] = useState(null)
  const [image, setImage] = useState(null)

  const [finalPrompt, setFinalPrompt] = useState(null)
  const imageDimensions = useIsMobile() ? '280px' : '390px'

  useEffect(() => {
    if (viewer && isDialogDisplayed && isModelReady) {
      // Clear out possible prior state
      setPrompt('')
      setFinalPrompt(null)
      setIsImagineLoading(false)
      const ss = viewer.takeScreenshot()
      setScreenshot(ss)
      setImage(ss)
    }
  }, [isDialogDisplayed, viewer, isModelReady])


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
      headerIcon={<AutoFixHighOutlinedIcon className='icon-share'/>}
      headerText={'Imagine'}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
    >
      <Helmet><title>{finalPrompt ? `Imagine: ${finalPrompt}` : 'Imagine'}</title></Helmet>
      <Stack
        sx={{
          'minHeight': imageDimensions,
          'minWidth': '35em',
          '@media (max-width: 900px)': {
            minWidth: '10em',
          },
        }}
      >
        <Box
          sx={{
            minHeight: imageDimensions,
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
             height={imageDimensions}
             data-testid='img-rendered'
             style={{borderRadius: '1em'}}
           />}
        </Box>
        <Stack
          sx={{padding: '1em 0em'}}
          direction='column'
          spacing={2}
          justifyContent='center'
        >
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
                <InputAdornment position="end">
                  <IconButton
                    aria-label="clear text"
                    onClick={onClearClick}
                    edge='end'
                    size='small'
                    sx={{marginRight: '-.4em', height: '2em', width: '2em'}}
                  >
                    <CloseIcon fontSize="small"/>
                  </IconButton>
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
