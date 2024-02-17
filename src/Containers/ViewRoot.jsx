import React, {useState} from 'react'
import {useNavigate} from 'react-router-dom'
import Box from '@mui/material/Box'
import useTheme from '@mui/styles/useTheme'
import {isOpfsAvailable, loadLocalFileDragAndDrop} from '../OPFS/utils'
import useStore from '../store/useStore'
import {loadLocalFileDragAndDropFallback} from '../utils/loader'
import {handleBeforeUnload} from '../utils/event'


/** @return {React.ReactElement} */
export default function ViewRoot({children}) {
  const appPrefix = useStore((state) => state.appPrefix)
  const isModelReady = useStore((state) => state.isModelReady)

  const [dragOver, setDragOver] = useState(false)

  const navigate = useNavigate()

  const theme = useTheme()

  /** Handles file moving into drag-n-drop area */
  function handleDragOverOrEnter(event) {
    event.preventDefault()
    setDragOver(true)
  }


  /** Handles file moving out of drag-n-drop area */
  function handleDragLeave(event) {
    event.preventDefault()
    setDragOver(false)
  }


  /** Handles file drop into drag-n-drop area */
  function handleDrop(event) {
    event.preventDefault()
    setDragOver(false)
    const files =
      event.dataTransfer.files
    // Here you can handle the files as needed
    if (files.length === 1) {
      if (isOpfsAvailable()) {
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
      sx={{
        position: 'absolute',
        top: '0px',
        left: '0px',
        flex: 1,
        width: '100vw',
        height: '100vh',
        zIndex: 10, // Adjust if needed
        boxSizing: 'border-box', // Adjust if needed
      }}
      onDragOver={handleDragOverOrEnter}
      onDragEnter={handleDragOverOrEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        border: dragOver ? `2px dashed ${theme.palette.primary.main}` : 'none',
        // ... other styling as needed
      }}
      data-testid={'cadview-dropzone'}
      // TODO(pablo): Really needed?
      data-model-ready={isModelReady}
    >
      {children}
    </Box>
  )
}
