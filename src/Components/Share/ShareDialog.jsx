import React, {ReactElement, useState, useEffect, createRef} from 'react'
import {Helmet} from 'react-helmet-async'
import {QRCode} from 'react-qr-code'
import {useLocation} from 'react-router-dom'
import {Box, IconButton, InputAdornment, Stack, TextField, Typography} from '@mui/material'
import useStore from '../../store/useStore'
import {addCameraUrlParams} from '../Camera/CameraControl'
import {removeCameraUrlParams} from '../Camera/hashState'
import {addPlanesToHashState, removePlanesFromHashState} from '../CutPlane/hashState'
import {HASH_PREFIX_DISPLAY, writeModelDisplayHash} from '../Residency/displayHash'
import {resolvedAppearance} from '../../viewer/display/DisplayController'
import {removeHashParams} from '../../utils/location'
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
 * Each toggle owns one hash token: cut planes `cp:`, camera `c:`, and
 * display settings `d:` (the Display menu's color / shading / residency —
 * design/new/model-display-controls.md §6). They all follow the same shape:
 * flip the state AND mutate `window.location` in the handler, because the URL
 * shown in the TextField and the QR code is read during render and
 * `window.location` isn't reactive.
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
  const displayOverrides = useStore((state) => state.displayOverrides)
  const [isPlaneInUrl, setIsPlaneInUrl] = useState(false)
  const [isLinkCopied, setIsLinkCopied] = useState(false)
  const [isCameraInUrl, setIsCameraInUrl] = useState(true)
  // Default ON, like the camera: the Display menu's choices are part of "what
  // the sender was looking at" (model-display-controls §6), and the `#d:`
  // token is empty for a model nobody has touched, so leaving it on costs
  // the common share link nothing.
  const [isDisplayInUrl, setIsDisplayInUrl] = useState(true)

  const urlTextFieldRef = createRef()
  const location = useLocation()
  // What a `#d:` token would carry right now — the Display menu resolved off
  // the override stack, same source ResidencyControl writes from.
  const appearance = resolvedAppearance(model, Object.values(displayOverrides))

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

  // Display state (`#d:`) gets its own effect rather than another branch of
  // the one above, which is gated on `viewer?.clipper` — the clipper has
  // nothing to do with the Display menu, and a model can carry display
  // choices long before one exists.
  useEffect(() => {
    // Gated on a loaded model, not just an open dialog: ResidencyControl
    // seeds the override stack from `#d:` when the model loads, so before
    // that the stack is empty and the resolved appearance is all-defaults.
    // Writing it would strip an incoming permalink's token before the app
    // ever read it, and the shared display would be lost on arrival.
    if (!isDialogDisplayed || !model) {
      return
    }
    if (isDisplayInUrl) {
      writeModelDisplayHash(window.location, appearance)
    } else {
      removeHashParams(window.location, HASH_PREFIX_DISPLAY)
    }
    // `appearance` is a fresh object every render; the axis values inside it
    // are what matter, and they only move when the overrides or the model do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayOverrides, isDialogDisplayed, isDisplayInUrl, model])

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


  // Mutating the hash here rather than leaving it to the effect above is
  // load-bearing, exactly as it is for the camera: `window.location` isn't
  // reactive, so the URL the TextField and the QR code render is read during
  // the render this setState triggers — which happens before the effect runs.
  const toggleDisplayIncluded = () => {
    if (isDisplayInUrl) {
      setIsDisplayInUrl(false)
      removeHashParams(window.location, HASH_PREFIX_DISPLAY)
    } else {
      setIsDisplayInUrl(true)
      writeModelDisplayHash(window.location, appearance)
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
          <Stack
            direction='row'
            justifyContent='space-around'
            alignItems='center'
          >
            <Typography>Display settings</Typography>
            <Toggle
              onChange={toggleDisplayIncluded}
              checked={isDisplayInUrl}
              data-testid='toggle-display'
            />
          </Stack>
        </Stack>
      </Stack>
    </Dialog>
  )
}
