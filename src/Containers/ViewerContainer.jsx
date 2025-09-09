import React, {ReactElement, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import Box from '@mui/material/Box'
import {useIsMobile} from '../Components/Hooks'
import {PlacemarkHandlers as placemarkHandlers} from '../Components/Markers/MarkerControl'
import useStore from '../store/useStore'
import {handleFileDrop, handleDragOverOrEnter, handleDragLeave} from '../utils/dragAndDrop'


/** @return {ReactElement} */
export default function ViewerContainer() {
  const appPrefix = useStore((state) => state.appPrefix)
  const isModelReady = useStore((state) => state.isModelReady)
  const isOpfsAvailable = useStore((state) => state.isOpfsAvailable)
  const setAlert = useStore((state) => state.setAlert)
  const {onSceneSingleTap, onSceneDoubleTap} = placemarkHandlers()
  const vh = useStore((state) => state.vh)
  const isMobile = useIsMobile()

  const [, setIsDragActive] = useState(false)

  const navigate = useNavigate()

  /** Handles file drop into drag-n-drop area */
  async function onDrop(event) {
    setIsDragActive(false)
    await handleFileDrop(event, navigate, appPrefix, isOpfsAvailable, setAlert)
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
