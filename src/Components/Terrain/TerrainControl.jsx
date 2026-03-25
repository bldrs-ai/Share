import React, {useEffect, useRef, useCallback} from 'react'
import {Mountain} from 'lucide-react'
import useStore from '../../store/useStore'
import TerrainManager from './TerrainManager'
import {TooltipIconButton} from '../Buttons'
import debug from '../../utils/debug'


/**
 * Terrain overlay toggle control.
 *
 * Shows a Mountain icon in the left toolbar when the model
 * has Swiss location data. First click downloads tiles and shows
 * terrain; subsequent clicks toggle visibility.
 *
 * @return {React.ReactElement|null}
 */
export default function TerrainControl() {
  const viewer = useStore((state) => state.viewer)
  const model = useStore((state) => state.model)
  const isModelReady = useStore((state) => state.isModelReady)

  const isTerrainEnabled = useStore((state) => state.isTerrainEnabled)
  const setIsTerrainEnabled = useStore((state) => state.setIsTerrainEnabled)
  const isTerrainVisible = useStore((state) => state.isTerrainVisible)
  const setIsTerrainVisible = useStore((state) => state.setIsTerrainVisible)
  const terrainStatus = useStore((state) => state.terrainStatus)
  const setTerrainStatus = useStore((state) => state.setTerrainStatus)
  const setTerrainTileProgress = useStore((state) => state.setTerrainTileProgress)

  const managerRef = useRef(null)
  const initedRef = useRef(false)

  // Initialize: check if model has Swiss location
  useEffect(() => {
    if (!viewer || !model || !isModelReady || initedRef.current) {
      return
    }
    initedRef.current = true

    const mgr = new TerrainManager(viewer)
    managerRef.current = mgr

    mgr.init(model).then((hasLocation) => {
      if (hasLocation) {
        setIsTerrainEnabled(true)
        debug().log('TerrainControl: Swiss location detected, terrain available')
      }
    })

    return () => {
      mgr.dispose()
      managerRef.current = null
      initedRef.current = false
      setIsTerrainEnabled(false)
      setIsTerrainVisible(false)
      setTerrainStatus('idle')
      setTerrainTileProgress(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, model, isModelReady])


  const handleClick = useCallback(async () => {
    const mgr = managerRef.current
    if (!mgr) {
      return
    }

    // If terrain is already loaded, just toggle visibility
    if (mgr.isLoaded) {
      const visible = mgr.toggle()
      setIsTerrainVisible(visible)
      return
    }

    // First click: download and show
    setTerrainStatus('loading')
    setTerrainTileProgress({downloaded: 0, total: 0})

    const success = await mgr.loadTerrain((progress) => {
      setTerrainTileProgress(progress)
    })

    if (success) {
      mgr.show()
      setIsTerrainVisible(true)
      setTerrainStatus('ready')
    } else {
      setTerrainStatus('error')
    }
    setTerrainTileProgress(null)
  }, [setIsTerrainVisible, setTerrainStatus, setTerrainTileProgress])


  if (!isTerrainEnabled) {
    return null
  }

  const isLoading = terrainStatus === 'loading'
  const title = isLoading ? 'Loading terrain...' :
    isTerrainVisible ? 'Hide terrain' : 'Show terrain'

  return (
    <TooltipIconButton
      title={title}
      icon={<Mountain size={18} strokeWidth={1.75}/>}
      onClick={handleClick}
      selected={isTerrainVisible}
      enabled={!isLoading}
      variant='control'
      placement='top'
      dataTestId='control-button-terrain'
    />
  )
}
