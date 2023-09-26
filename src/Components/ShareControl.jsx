import React, {createRef, useEffect, useState} from 'react'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Stack from '@mui/material/Stack'
import useStore from '../store/useStore'
import {addPlaneLocationToUrl} from './CutPlaneMenu'
import {removeHashParams} from '../utils/location'
import Dialog from './Dialog'
import {
  addCameraUrlParams,
  removeCameraUrlParams,
} from './CameraControl'
import {ControlButton} from './Buttons'
import Toggle from './Toggle'
import CopyIcon from '../assets/icons/Copy.svg'
import {Helmet} from 'react-helmet-async'
import ShareIcon from '@mui/icons-material/Share'


/**
 * This button hosts the ShareDialog component and toggles it open and
 * closed.
 *
 * @return {React.ReactElement} The button react component, with a hosted
 *   ShareDialog component
 */
export default function ShareControl() {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
  const openedDialog = !!isDialogDisplayed


  return (
    <ControlButton
      title='Share'
      icon={<ShareIcon className='icon-share' color='secondary'/>}
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
  const viewer = useStore((state) => state.viewer)
  const model = useStore((state) => state.model)
  const urlTextFieldRef = createRef()
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
    closeDialog()
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


  return (
    <Dialog
      icon={<ShareIcon className='icon-share'/>}
      headerText='Share'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={closeDialog}
      actionTitle='Copy Link'
      actionIcon={<CopyIcon className='icon-share'/>}
      actionCb={onCopy}
      content={
        <Stack spacing={1}>
          <Helmet>
            <title>Share IFC Model — BLDRS</title>
          </Helmet>
          <TextField
            value={String(window.location)}
            inputRef={urlTextFieldRef}
            variant='outlined'
            multiline
            rows={6}
            InputProps={{
              readOnly: true,
            }}
          />
          <Stack spacing={0}>
            {isPlanesOn &&
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
      }
    />)
}
