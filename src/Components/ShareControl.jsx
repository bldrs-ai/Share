import React, {createRef, useEffect, useState} from 'react'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {makeStyles} from '@mui/styles'
import useStore from '../store/useStore'
import Dialog from './Dialog'
import CameraIcon from '../assets/2D_Icons/Camera.svg'
import CopyIcon from '../assets/2D_Icons/Copy.svg'
import ShareIcon from '../assets/2D_Icons/Share.svg'
import {
  addCameraUrlParams,
  removeCameraUrlParams,
} from './CameraControl'
import {ControlButton, TooltipIconButton} from './Buttons'

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
  const viewer = useStore((state) => state.viewerStore)
  const [isLinkCopied, setIsLinkCopied] = useState(false)
  const [isCameraInUrl, setIsCameraInUrl] = useState(false)
  const cameraControls = useStore((state) => state.cameraControls)
  const urlTextFieldRef = createRef()
  const classes = useStyles()

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

  return (
    <Dialog
      icon={<ShareIcon/>}
      headerText={<Typography variant='h2'>Share</Typography>}
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
