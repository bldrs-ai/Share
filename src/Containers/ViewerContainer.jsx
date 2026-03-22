import React, {ReactElement, useState, useEffect} from 'react'
import {useNavigate} from 'react-router-dom'
import {Box} from '@mui/material'
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
  const isAppsVisible = useStore((state) => state.isAppsVisible)
  const appsDrawerWidth = useStore((state) => state.appsDrawerWidth)
  const viewer = useStore((state) => state.viewer)

  // Resize Three.js renderer when apps drawer opens/closes
  const viewerWidth = (!isMobile && isAppsVisible) ? `calc(100vw - ${appsDrawerWidth}px)` : '100vw'

  useEffect(() => {
    if (!viewer) return
    const timer = setTimeout(() => {
      const container = document.getElementById('viewer-container')
      if (!container) return
      const w = container.clientWidth
      const h = container.clientHeight
      if (w <= 0 || h <= 0) return
      try {
        const renderer = viewer.context.getRenderer()
        renderer.setSize(w, h)
        const camera = viewer.context.getCamera()
        if (camera.isPerspectiveCamera) {
          camera.aspect = w / h
          camera.updateProjectionMatrix()
        }
      } catch { /* */ }
    }, 50)
    return () => clearTimeout(timer)
  }, [isAppsVisible, appsDrawerWidth, viewer])

  const [, setIsDragActive] = useState(false)

  const navigate = useNavigate()

  /**
   * Handles file drop into drag-n-drop area
   *
   * @param {Event} event - The drop event
   */
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
        width: viewerWidth,
        height: isMobile ? `${vh}px` : '100vh',
        transition: 'width 0.2s ease',
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
