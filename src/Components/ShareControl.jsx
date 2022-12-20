import React, {createRef, useEffect, useState} from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {makeStyles} from '@mui/styles'
import useStore from '../store/useStore'
import {addPlaneLocationToUrl} from './CutPlaneMenu'
import {removeHashParams} from '../utils/location'
import Dialog from './Dialog'
import {
  addCameraUrlParams,
  removeCameraUrlParams,
} from './CameraControl'
import {ControlButton, RectangularButton} from './Buttons'
import Toggle from './Toggle'
import CopyIcon from '../assets/2D_Icons/Copy.svg'
import ShareIcon from '../assets/2D_Icons/Share.svg'


/**
 * This button hosts the ShareDialog component and toggles it open and
 * closed.
 *
 * @return {object} The button react component, with a hosted
 *   ShareDialog component
 */
export default function ShareControl() {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
  const openedDialog = !!isDialogDisplayed
  const classes = useStyles()
  return (
    <ControlButton
      title='Share'
      icon={<div className={classes.iconContainer}><ShareIcon/></div>}
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
  const [isLinkCopied, setIsLinkCopied] = useState(false)
  const [isCameraInUrl, setIsCameraInUrl] = useState(true)
  const [isPlaneInUrl, setIsPlaneInUrl] = useState(false)
  const cameraControls = useStore((state) => state.cameraControls)
  const viewer = useStore((state) => state.viewerStore)
  const model = useStore((state) => state.modelStore)
  const urlTextFieldRef = createRef()
  const classes = useStyles()
  const isPlanesOn = viewer.clipper.planes.length > 0

  useEffect(() => {
    if (viewer) {
      if (isCameraInUrl) {
        addCameraUrlParams(cameraControls)
      } else {
        removeCameraUrlParams()
      }
    }
    if (isPlanesOn) {
      setIsPlaneInUrl(true)
      addPlaneLocationToUrl(viewer, model)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, model])

  const closeDialog = () => {
    setIsDialogDisplayed(false)
    setIsLinkCopied(false)
  }

  const onCopy = (event) => {
    setIsLinkCopied(true)
    navigator.clipboard.writeText(location)
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
      removeHashParams(window.location, 'p')
    } else {
      addPlaneLocationToUrl(viewer, model)
    }
    setIsPlaneInUrl(!isPlaneInUrl)
  }

  const rowStyle = {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  }

  return (
    <Dialog
      icon={<ShareIcon/>}
      headerText='Share'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={closeDialog}
      content={
        <div className={classes.content}>
          <TextField
            value={String(window.location)}
            inputRef={urlTextFieldRef}
            variant='outlined'
            multiline
            rows={5}
            InputProps={{
              readOnly: true,
              className: classes.input}}
          />
          <Box sx={{
            width: '100%',
            marginTop: '20px',
            display: 'flex',
            flexDirection: 'column',
            paddingLeft: '10px',
          }}
          >
            {isPlanesOn &&
              <Box sx={rowStyle}>
                <Typography>Cutplane position</Typography>
                <Toggle
                  onChange={togglePlaneIncluded}
                  checked={isPlaneInUrl}
                />
              </Box>
            }
            <Box sx={rowStyle}>
              <Typography>Camera position</Typography>
              <Toggle
                onChange={toggleCameraIncluded}
                checked={isCameraInUrl}
              />
            </Box>
          </Box>
          <Box sx={{
            marginTop: '20px',
            marginBottom: '10px',
          }}
          >
            <RectangularButton title={'Copy Link'} icon={<CopyIcon/>} onClick={onCopy} />
          </Box>
        </div>
      }
    />)
}


const useStyles = makeStyles({
  content: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: '10px',
  },
  iconContainer: {
    width: '20px',
    height: '20px',
    marginBottom: '2px',
  },
  buttonsContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '10px',
    width: '44%',
  },
})
