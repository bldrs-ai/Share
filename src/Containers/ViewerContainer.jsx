import React, {ReactElement, useState} from 'react'
import Box from '@mui/material/Box'
import {useNavigate} from 'react-router-dom'
import {PlacemarkHandlers as placemarkHandlers} from '../Components/Markers/MarkerControl'
import useStore from '../store/useStore'
import {loadLocalFileDragAndDrop} from '../OPFS/utils'
import {handleBeforeUnload} from '../utils/event'
import {loadLocalFileDragAndDropFallback} from '../utils/loader'


/** @return {ReactElement} */
export default function ViewerContainer() {
  const appPrefix = useStore((state) => state.appPrefix)
  const isModelReady = useStore((state) => state.isModelReady)
  const isOpfsAvailable = useStore((state) => state.isOpfsAvailable)
  const {onSceneSingleTap, onSceneDoubleTap} = placemarkHandlers()

  const [, setIsDragActive] = useState(false)

  const navigate = useNavigate()

  /** Handles file moving into drag-n-drop area */
  function handleDragOverOrEnter(event) {
    event.preventDefault()
    setIsDragActive(true)
  }


  /** Handles file moving out of drag-n-drop area */
  function handleDragLeave(event) {
    event.preventDefault()
    setIsDragActive(false)
  }


  /** Handles file drop into drag-n-drop area */
  function handleDrop(event) {
    event.preventDefault()
    setIsDragActive(false)
    const files =
      event.dataTransfer.files
    // Here you can handle the files as needed
    if (files.length === 1) {
      if (isOpfsAvailable) {
        loadLocalFileDragAndDrop(
          navigate,
          appPrefix,
          handleBeforeUnload,
          files[0])
      } else {
        loadLocalFileDragAndDropFallback(
          navigate,
          appPrefix,
          handleBeforeUnload,
          files[0],
        )
      }
    }
  }


  return (
    <Box
      id='viewer-container'
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        textAlign: 'center',
      }}
      onMouseDown={async (event) => await onSceneSingleTap(event)}
      onDoubleClick={async (event) => await onSceneDoubleTap(event)}
      onDragOver={handleDragOverOrEnter}
      onDragEnter={handleDragOverOrEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid='cadview-dropzone'
      data-model-ready={isModelReady}
    />
  )
}
