import React, {ReactElement, createRef, useEffect, useState} from 'react'
import {useLocation} from 'react-router-dom'
import {Helmet} from 'react-helmet-async'
import QRCode from 'react-qr-code'
import Box from '@mui/material/Box'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import useStore from '../store/useStore'
import {ControlButtonWithHashState} from './Buttons'
import {addCameraUrlParams, removeCameraUrlParams} from './CameraControl'
import {addPlanesToHashState, removePlanesFromHashState} from './CutPlaneMenu'
import Dialog from './Dialog'
import Toggle from './Toggle'
import CopyIcon from '../assets/icons/Copy.svg'
import ShareIcon from '../assets/icons/Share.svg'


/**
 * This button hosts the ShareDialog component and toggles it open and
 * closed.
 *
 * @return {ReactElement} The button react component, with a hosted
 *   ShareDialog component
 */
export default function ShareControl() {
  const isShareVisible = useStore((state) => state.isShareVisible)
  const setIsShareVisible = useStore((state) => state.setIsShareVisible)
  return (
    <ControlButtonWithHashState
      title='Share'
      icon={<ShareIcon className='icon-share'/>}
      isDialogDisplayed={isShareVisible}
      setIsDialogDisplayed={setIsShareVisible}
      hashPrefix={SHARE_PREFIX}
      placement='left'
    >
      <ShareDialog
        isDialogDisplayed={isShareVisible}
        setIsDialogDisplayed={setIsShareVisible}
      />
    </ControlButtonWithHashState>
  )
}

export const SHARE_PREFIX = 'share'

/**
 * The ShareDialog component lets the user control what state is
 * included in the shared URL and assists in copying the URL to
 * clipboard.
 *
 * @property {boolean} isDialogDisplayed Passed to Dialog to be controlled
 * @property {Function} setIsDialogDisplayed Passed to Dialog to be controlled
 * @return {ReactElement}
 */
function ShareDialog({isDialogDisplayed, setIsDialogDisplayed}) {
  const cameraControls = useStore((state) => state.cameraControls)
  const viewer = useStore((state) => state.viewer)
  const model = useStore((state) => state.model)

  const [isLinkCopied, setIsLinkCopied] = useState(false)
  const [isCameraInUrl, setIsCameraInUrl] = useState(true)
  const [isPlaneInUrl, setIsPlaneInUrl] = useState(false)

  const urlTextFieldRef = createRef()

  useEffect(() => {
    if (viewer && isDialogDisplayed) {
      if (isCameraInUrl) {
        addCameraUrlParams(cameraControls)
      } else {
        removeCameraUrlParams()
      }

      if (viewer.clipper.planes.length > 0) {
        setIsPlaneInUrl(true)
        addPlanesToHashState(viewer, model)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, model, isDialogDisplayed])

  const onCopy = (event) => {
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
      removePlanesFromHashState()
    } else {
      addPlanesToHashState(viewer, model)
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
      actionIcon={<CopyIcon className='icon-share'/>}
      actionCb={onCopy}
    >
      <Stack spacing={1}>
        <Helmet>
          <title>Share Model</title>
        </Helmet>
        <Box>
          <QRCode
            data-testid="qrcode"
            style={{
              height: 'auto',
              maxWidth: '82%',
              marginBottom: '18px',
              borderRadius: '6px',
            }}
            value={String(window.location)}
            viewBox={`0 0 100 100`}
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
              <InputAdornment position="end">
                <IconButton
                  onClick={onCopy}
                  edge="end"
                  size='small'
                >
                  <ContentCopyIcon size='inherit' sx={{width: '16px', height: '16px'}}/>
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <Stack spacing={0}>
          {isPlaneInUrl &&
           <Stack
             direction="row"
             justifyContent="space-around"
             alignItems="center"
           >
             <Typography>Cutplane position</Typography>
             <Toggle
               onChange={togglePlaneIncluded}
               checked={isPlaneInUrl}
             />
           </Stack>
          }
          <Stack
            direction="row"
            justifyContent="space-around"
            alignItems="center"
          >
            <Typography>Camera position</Typography>
            <Toggle
              onChange={toggleCameraIncluded}
              checked={isCameraInUrl}
            />
          </Stack>
        </Stack>
      </Stack>
    </Dialog>
  )
}
