import React, {createRef, useEffect, useState} from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import {makeStyles} from '@mui/styles'
import useStore from '../store/useStore'
import {getPlanesLocation} from '../utils/cutPlane'
import Dialog from './Dialog'
import {
  addCameraUrlParams,
  removeCameraUrlParams,
} from './CameraControl'
import {ControlButton, TooltipIconButton} from './Buttons'
import CameraIcon from '../assets/2D_Icons/Camera.svg'
import CutPlaneIcon from '../assets/2D_Icons/CutPlane.svg'
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
  const classes = useStyles()
  return (
    <ControlButton
      title='Share'
      icon={<div className={classes.iconContainer}><ShareIcon/></div>}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      dialog={
        <ShareDialog
          isDialogDisplayed={isDialogDisplayed}
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
  const [isCameraInUrl, setIsCameraInUrl] = useState(false)
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
  }, [viewer, isCameraInUrl, cameraControls])

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
    } else {
      setIsCameraInUrl(true)
    }
    if (isLinkCopied) {
      setIsLinkCopied(false)
    }
  }

  const togglePlaneIncluded = () => {
    getPlanesLocation(viewer, model)
  }

  return (
    <Dialog
      icon={<ShareIcon/>}
      headerText={<Box style={{paddingBottom: '0px', marginTop: '-10px'}}>Share</Box>}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={closeDialog}
      content={
        <div className={classes.content}>
          <TextField
            value={window.location}
            inputRef={urlTextFieldRef}
            variant='outlined'
            multiline
            rows={5}
            InputProps={{
              readOnly: true,
              className: classes.input}}
          />
          <div className={classes.buttonsContainer}>
            {isPlanesOn &&
            <TooltipIconButton
              title='Include plane position'
              selected={isCameraInUrl}
              placement={'bottom'}
              onClick={togglePlaneIncluded}
              icon={<CutPlaneIcon />}
            />}
            <TooltipIconButton
              title='Include camera position'
              selected={isCameraInUrl}
              placement={'bottom'}
              onClick={toggleCameraIncluded}
              icon={<CameraIcon />}
            />
            <TooltipIconButton
              title='Copy Link'
              selected={isLinkCopied}
              placement={'bottom'}
              onClick={onCopy}
              icon={<CopyIcon />}
            />
          </div>
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
    marginTop: '20px',
    width: '50%',
  },
})
