import React, {ReactElement, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import Box from '@mui/material/Box'
import {useIsMobile} from '../Components/Hooks'
import {PlacemarkHandlers as placemarkHandlers} from '../Components/Markers/MarkerControl'
import {guessTypeFromFile} from '../Filetype'
import {saveDnDFileToOpfs} from '../OPFS/utils'
import useStore from '../store/useStore'
import debug from '../utils/debug'
import {disablePageReloadApprovalCheck} from '../utils/event'
import {saveDnDFileToOpfsFallback} from '../utils/loader'
import {trackAlert} from '../utils/alertTracking'


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
  async function onDrop(event) {
    event.preventDefault()
    const files = event.dataTransfer.files

    if (files.length === 0) {
      const message = 'File upload initiated but found no data'
      trackAlert(message)
      setAlert(message)
      return
    }
    if (files.length > 1) {
      const message = 'File upload initiated for more than 1 file'
      trackAlert(message)
      setAlert(message)
      return
    }
    const uploadedFile = files[0]

    debug().log('ViewerContainer#handleDrop: uploadedFile', uploadedFile)
    setIsDragActive(false)
    const type = await guessTypeFromFile(uploadedFile)
    if (type === null) {
      const message = `File upload of unknown type: type(${uploadedFile.type}) size(${uploadedFile.size})`
      trackAlert(message)
      setAlert(message)
      return
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
        height: isMobile ? `${vh}px` : '100vh',
        margin: 0,
        padding: 0,
        textAlign: 'center',
      }}
      onMouseDown={async (event) => await onSceneSingleTap(event)}
      onDoubleClick={async (event) => await onSceneDoubleTap(event)}
      onDragOver={handleDragOverOrEnter}
      onDragEnter={handleDragOverOrEnter}
      onDragLeave={handleDragLeave}
      onDrop={onDrop}
      data-testid='cadview-dropzone'
      data-model-ready={isModelReady}
    />
  )
}
