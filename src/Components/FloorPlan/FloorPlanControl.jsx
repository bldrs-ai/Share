import React, {ReactElement, useEffect, useRef, useCallback} from 'react'
import {useLocation} from 'react-router-dom'
import {Layers} from 'lucide-react'
import useStore from '../../store/useStore'
import FloorPlanManager from './FloorPlanManager'
import {getFloorFromHash, addFloorToHash, removeFloorFromHash} from './hashState'
import {TooltipIconButton} from '../Buttons'
import debug from '../../utils/debug'


/**
 * Floor Plan toggle button.
 * Initializes the FloorPlanManager and stores it for SVGFloorPlanView to use.
 *
 * @return {ReactElement}
 */
export default function FloorPlanControl() {
  const viewer = useStore((state) => state.viewer)
  const model = useStore((state) => state.model)
  const isModelReady = useStore((state) => state.isModelReady)

  const isFloorPlanMode = useStore((state) => state.isFloorPlanMode)
  const setIsFloorPlanMode = useStore((state) => state.setIsFloorPlanMode)
  const setCurrentFloorIndex = useStore((state) => state.setCurrentFloorIndex)
  const floors = useStore((state) => state.floors)
  const setFloors = useStore((state) => state.setFloors)
  const floorPlanCutHeight = useStore((state) => state.floorPlanCutHeight)
  const setFloorPlanManager = useStore((state) => state.setFloorPlanManager)

  const initedRef = useRef(false)
  const managerRef = useRef(null)

  const location = useLocation()

  // Initialize once when model is ready
  useEffect(() => {
    if (!viewer || !model || !isModelReady || initedRef.current) return
    initedRef.current = true

    const mgr = new FloorPlanManager(viewer, model)
    managerRef.current = mgr
    setFloorPlanManager(mgr)

    mgr.getFloors().then((foundFloors) => {
      if (foundFloors.length > 0) {
        setFloors(foundFloors)
        debug().log('FloorPlanControl: Found', foundFloors.length, 'floors')

        const hashFloor = getFloorFromHash(location)
        if (hashFloor !== null && hashFloor < foundFloors.length) {
          mgr.enterFloorPlan(foundFloors[hashFloor], 1.2)
          setCurrentFloorIndex(hashFloor)
          setIsFloorPlanMode(true)
          useStore.getState().setIsSvgFloorPlanVisible(true)
        }
      }
    })

    return () => {
      mgr.dispose()
      managerRef.current = null
      setFloorPlanManager(null)
      initedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, model, isModelReady])

  const toggle = useCallback(() => {
    const mgr = managerRef.current
    if (!mgr) return

    if (isFloorPlanMode) {
      // Exit
      mgr.exitFloorPlan()
      setIsFloorPlanMode(false)
      setCurrentFloorIndex(null)
      useStore.getState().setIsSvgFloorPlanVisible(false)
      removeFloorFromHash()
    } else {
      // Enter with first floor
      if (floors.length === 0) return
      mgr.enterFloorPlan(floors[0], floorPlanCutHeight)
      setCurrentFloorIndex(0)
      setIsFloorPlanMode(true)
      useStore.getState().setIsSvgFloorPlanVisible(true)
      useStore.getState().setIsAppsVisible(false)
      addFloorToHash(0)
    }
  }, [isFloorPlanMode, floors, floorPlanCutHeight, setIsFloorPlanMode, setCurrentFloorIndex])

  // Escape key
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && isFloorPlanMode) {
        const mgr = managerRef.current
        if (mgr) mgr.exitFloorPlan()
        setIsFloorPlanMode(false)
        setCurrentFloorIndex(null)
        useStore.getState().setIsSvgFloorPlanVisible(false)
        removeFloorFromHash()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFloorPlanMode, setIsFloorPlanMode, setCurrentFloorIndex])

  if (!floors.length && !isFloorPlanMode) return null

  return (
    <TooltipIconButton
      title='Floor Plans'
      icon={<Layers size={16} strokeWidth={1.75}/>}
      onClick={toggle}
      selected={isFloorPlanMode}
      variant='control'
      placement='bottom'
      dataTestId='control-button-floor-plan'
    />
  )
}
