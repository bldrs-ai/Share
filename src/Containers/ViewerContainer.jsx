import React, {ReactElement, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {Box} from '@mui/material'
import {useAuth0} from '../Auth0/Auth0Proxy'
import {useIsMobile} from '../Components/Hooks'
import {PlacemarkHandlers as placemarkHandlers} from '../Components/Markers/MarkerControl'
import {getUserTier} from '../privacy/usageTracking'
import useStore from '../store/useStore'
import {handleFileDrop, handleDragOverOrEnter, handleDragLeave} from '../utils/dragAndDrop'


/** @return {ReactElement} */
export default function ViewerContainer() {
  const appPrefix = useStore((state) => state.appPrefix)
  const appMetadata = useStore((state) => state.appMetadata)
  const isModelReady = useStore((state) => state.isModelReady)
  const isOpfsAvailable = useStore((state) => state.isOpfsAvailable)
  const setAlert = useStore((state) => state.setAlert)
  const setIsUsageLimitDialogVisible = useStore((state) => state.setIsUsageLimitDialogVisible)
  const {onSceneSingleTap, onSceneDoubleTap} = placemarkHandlers()
  const {isAuthenticated} = useAuth0()
  const vh = useStore((state) => state.vh)
  const isMobile = useIsMobile()

  const [, setIsDragActive] = useState(false)

  const navigate = useNavigate()
  const userTier = getUserTier(isAuthenticated, appMetadata)

  /**
   * Handles file drop into drag-n-drop area
   *
   * @param {Event} event - The drop event
   */
  async function onDrop(event) {
    setIsDragActive(false)
    await handleFileDrop(
      event, navigate, appPrefix, isOpfsAvailable, setAlert,
      undefined, undefined,
      userTier,
      (info) => setIsUsageLimitDialogVisible(true, info),
    )
  }


  return (
    <Box
      id='viewer-container'
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100vw',
        height: isMobile ? `${vh}px` : '100vh',
        margin: 0,
        padding: 0,
        textAlign: 'center',
      }}
      onMouseDown={async (event) => await onSceneSingleTap(event)}
      onDoubleClick={async (event) => await onSceneDoubleTap(event)}
      onDragOver={(event) => handleDragOverOrEnter(event, setIsDragActive)}
      onDragEnter={(event) => handleDragOverOrEnter(event, setIsDragActive)}
      onDragLeave={(event) => handleDragLeave(event, setIsDragActive)}
      onDrop={onDrop}
      data-testid='cadview-dropzone'
      data-model-ready={isModelReady}
    />
  )
}
