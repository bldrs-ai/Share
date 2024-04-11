import React, {ReactElement, useState} from 'react'
import Box from '@mui/material/Box'
import usePlaceMark from '../hooks/usePlaceMark'
import {useNavigate} from 'react-router-dom'
import {loadLocalFileDragAndDrop} from '../OPFS/utils'
import useStore from '../store/useStore'
import {loadLocalFileDragAndDropFallback} from '../utils/loader'
import {handleBeforeUnload} from '../utils/event'


/** @return {ReactElement} */
export default function ViewerContainer() {
  const {onSceneSingleTap, onSceneDoubleTap} = usePlaceMark()

  const appPrefix = useStore((state) => state.appPrefix)
  const isModelReady = useStore((state) => state.isModelReady)
  const isOPFSAvailable = useStore((state) => state.isOPFSAvailable)

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
      if (isOPFSAvailable) {
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
      {...onSceneDoubleTap}
      onDragOver={handleDragOverOrEnter}
      onDragEnter={handleDragOverOrEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid='cadview-dropzone'
      data-model-ready={isModelReady}
    />
  )
}
