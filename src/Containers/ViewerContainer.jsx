import React, {ReactElement, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import Box from '@mui/material/Box'
import {guessTypeFromFile} from '../Filetype'
import {saveDnDFileToOpfs} from '../OPFS/utils'
import usePlaceMark from '../hooks/usePlaceMark'
import useStore from '../store/useStore'
import debug from '../utils/debug'
import {disablePageReloadApprovalCheck} from '../utils/event'
import {saveDnDFileToOpfsFallback} from '../utils/loader'


/** @return {ReactElement} */
export default function ViewerContainer() {
  const {onSceneSingleTap, onSceneDoubleTap} = usePlaceMark()

  const appPrefix = useStore((state) => state.appPrefix)
  const isModelReady = useStore((state) => state.isModelReady)
  const isOpfsAvailable = useStore((state) => state.isOpfsAvailable)

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
  async function handleDrop(event) {
    event.preventDefault()
    setIsDragActive(false)
    const files = event.dataTransfer.files
    if (files.length === 0) {
      throw new Error('File upload initiated but found no data')
    }
    if (files.length > 1) {
      throw new Error('File upload initiated for more than 1 file')
    }

    const uploadedFile = files[0]
    debug().log('ViewerContainer#handleDrop: uploadedFile', uploadedFile)

    const type = await guessTypeFromFile(uploadedFile)
    if (type === null) {
      throw new Error('File upload of unknown type')
    }

    /** @param {string} fileName The filename the upload was given */
    function onWritten(fileName) {
      disablePageReloadApprovalCheck()
      debug().log('ViewerContainer#handleDrop: navigate to:', fileName)
      navigate(`${appPrefix}/v/new/${fileName}`)
    }

    if (isOpfsAvailable) {
      saveDnDFileToOpfs(uploadedFile, type, onWritten)
    } else {
      saveDnDFileToOpfsFallback(uploadedFile, onWritten)
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
