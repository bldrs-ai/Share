import React, {createRef, useEffect, useState} from 'react'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import {makeStyles} from '@mui/styles'
import {ControlButton} from './Buttons'
import Dialog from './Dialog'
import {
  addCameraUrlParams,
  hasValidUrlParams as urlHasCameraCoords,
  removeCameraUrlParams,
} from './CameraControl'
import {assertDefinedBoolean} from '../utils/assert'
import CameraIcon from '../assets/2D_Icons/Camera.svg'
import CopyIcon from '../assets/2D_Icons/Copy.svg'
import ShareIcon from '../assets/2D_Icons/Share.svg'


/**
 * This button hosts the ShareDialog component and toggles it open and
 * closed.
 * @param {Object} viewer ifc viewer
 * @return {Object} The button react component, with a hosted
 *   ShareDialog component
 */
export default function ShareControl({viewer}) {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
  return (
    <ControlButton
      title='Share this model'
      icon={<ShareIcon/>}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      dialog={
        <ShareDialog
          viewer={viewer}
          isDialogDisplayed={isDialogDisplayed}
          setIsDialogDisplayed={setIsDialogDisplayed}/>
      }/>
  )
}


/**
 * The ShareDialog component lets the user control what state is
 * included in the shared URL and assists in copying the URL to
 * clipboard.
 * @param {Object} viewer IFC viewer
 * @param {boolean} isDialogDisplayed
 * @param {function} setIsDialogDisplayed
 * @return {Component} The react component
 */
function ShareDialog({viewer, isDialogDisplayed, setIsDialogDisplayed}) {
  const [isLinkCopied, setIsLinkCopied] = useState(false)
  const [isCameraInUrl, setIsCameraInUrl] = useState(assertDefinedBoolean(urlHasCameraCoords()))
  const urlTextFieldRef = createRef()
  const classes = useStyles()

  useEffect(() => {
    if (viewer) {
      if (isCameraInUrl) {
        addCameraUrlParams(viewer)
      } else {
        removeCameraUrlParams()
      }
    }
  }, [viewer, isCameraInUrl])

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

  const CameraButton = () => {
    return (
      <ToggleButton value='cameraInclude' selected={isCameraInUrl}>
        <CameraIcon/>
      </ToggleButton>)
  }

  return (
    <Dialog
      icon={<ShareIcon/>}
      headerText='Share the model link'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={closeDialog}
      content={
        <div className={classes.content}>
          <div>
            <TextField
              value={window.location}
              inputRef={urlTextFieldRef}
              variant='outlined'
              InputProps={{readOnly: true}}
            />
            <ToggleButton
              value='copy'
              selected={isLinkCopied}
              onClick={onCopy}
              aria-label='Copy the link'
              color='success'>
              <CopyIcon/>
            </ToggleButton>
          </div>
          <FormGroup>
            <FormControlLabel
              label={'Include camera position'}
              control={
                <Checkbox
                  onClick={toggleCameraIncluded}
                  icon={<CameraButton/>}
                  checkedIcon={<CameraButton/>}
                  color='success'/>
              }/>
          </FormGroup>
        </div>
      }/>)
}


const useStyles = makeStyles({
  content: {
    '& .MuiTextField-root': {
      width: '80%',
    },
    '& input': {
      width: '20em',
    },
    '& .MuiFormGroup-root': {
      width: '100%',
      alignItems: 'center',
      verticalAlign: 'middle',
      margin: 0,
    },
    '& .MuiFormControlLabel-root': {
      margin: 0,
    },
  },
})
