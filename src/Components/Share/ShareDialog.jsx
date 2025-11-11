import React, {ReactElement, useState, useEffect, createRef} from 'react'
import {Helmet} from 'react-helmet-async'
import {QRCode} from 'react-qr-code'
import {useLocation} from 'react-router-dom'
import {Box, IconButton, InputAdornment, Stack, TextField, Typography} from '@mui/material'
import useStore from '../../store/useStore'
import {addCameraUrlParams} from '../Camera/CameraControl'
import {removeCameraUrlParams} from '../Camera/hashState'
import {addPlanesToHashState, removePlanesFromHashState} from '../CutPlane/hashState'
import {gtagEvent} from '../../privacy/analytics'
import Dialog from '../Dialog'
import Toggle from '../Toggle'
import {
  ShareOutlined as ShareIcon,
  ContentCopy as ContentCopyIcon,
} from '@mui/icons-material'


/**
 * The ShareDialog component lets the user control what state is
 * included in the shared URL and assists in copying the URL to
 * clipboard.
 *
 * @property {boolean} isDialogDisplayed Passed to Dialog to be controlled
 * @property {Function} setIsDialogDisplayed Passed to Dialog to be controlled
 * @return {ReactElement}
 */
export default function ShareDialog({isDialogDisplayed, setIsDialogDisplayed}) {
  const model = useStore((state) => state.model)
  const viewer = useStore((state) => state.viewer)
  const cameraControls = useStore((state) => state.cameraControls)
  const isCutPlaneActive = useStore((state) => state.isCutPlaneActive)
  const [isPlaneInUrl, setIsPlaneInUrl] = useState(false)
  const [isLinkCopied, setIsLinkCopied] = useState(false)
  const [isCameraInUrl, setIsCameraInUrl] = useState(true)

  const urlTextFieldRef = createRef()
  const location = useLocation()

  useEffect(() => {
    if (viewer?.clipper && isDialogDisplayed) {
      if (isCameraInUrl) {
        addCameraUrlParams(cameraControls)
      } else {
        removeCameraUrlParams()
      }

      if (isCutPlaneActive) {
        setIsPlaneInUrl(true)
        addPlanesToHashState(location, viewer, model)
      }
    }
  }, [cameraControls, isCameraInUrl, isCutPlaneActive, isDialogDisplayed, location, model, viewer, viewer?.clipper])

  // Track when share dialog is opened
  useEffect(() => {
    if (model && isDialogDisplayed) {
      gtagEvent('share', {
        method: 'url',
        content_type: model.type || 'unknown',
        item_id: window.location.path,
      })
    }
  }, [isDialogDisplayed, model])


  const onCopy = () => {
    setIsLinkCopied(true)
    navigator.clipboard.writeText(window.location)
    urlTextFieldRef.current.select()
  }


  const toggleCameraIncluded = () => {
    if (isCameraInUrl) {
      setIsCameraInUrl(false)
      removeCameraUrlParams()
    } else {
      setIsCameraInUrl(true)
      addCameraUrlParams(cameraControls)
    }
    if (isLinkCopied) {
      setIsLinkCopied(false)
    }
  }


  const togglePlaneIncluded = () => {
    if (isPlaneInUrl) {
      removePlanesFromHashState(location)
    } else {
      addPlanesToHashState(location, viewer, model)
    }
    setIsPlaneInUrl(!isPlaneInUrl)
  }


  return (
    <Dialog
      headerIcon={<ShareIcon className='icon-share'/>}
      headerText='Share'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      actionTitle='Copy Link'
      actionIcon={<ContentCopyIcon className='icon-share'/>}
      actionCb={onCopy}
    >
      <Stack spacing={1}>
        <Helmet>
          <title>Share Model</title>
        </Helmet>
        <Box>
          <QRCode
            style={{
              height: 'auto',
              maxWidth: '82%',
              marginBottom: '18px',
              borderRadius: '6px',
            }}
            value={String(window.location)}
            viewBox={`0 0 100 100`}
            data-testid='img-qrcode'
          />
        </Box>
        <TextField
          value={String(window.location)}
          inputRef={urlTextFieldRef}
          variant='outlined'
          multiline
          size='small'
          rows={1}
          InputProps={{
            readOnly: true,
            endAdornment: (
              <InputAdornment position='end'>
                <IconButton
                  onClick={onCopy}
                  edge='end'
                  size='small'
                >
                  <ContentCopyIcon size='inherit' sx={{width: '16px', height: '16px'}}/>
                </IconButton>
              </InputAdornment>
            ),
          }}
          data-testid='textfield-link'
        />
        <Stack spacing={0}>
          {isCutPlaneActive &&
           <Stack
             direction='row'
             justifyContent='space-around'
             alignItems='center'
           >
             <Typography>Cutplane position</Typography>
             <Toggle
               onChange={togglePlaneIncluded}
               checked={isPlaneInUrl}
               data-testid='toggle-cutplane'
             />
           </Stack>
          }
          <Stack
            direction='row'
            justifyContent='space-around'
            alignItems='center'
          >
            <Typography>Camera position</Typography>
            <Toggle
              onChange={toggleCameraIncluded}
              checked={isCameraInUrl}
              data-testid='toggle-camera'
            />
          </Stack>
        </Stack>
      </Stack>
    </Dialog>
  )
}
