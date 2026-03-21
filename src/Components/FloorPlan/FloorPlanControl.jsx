import React, {ReactElement, useState, useEffect, useCallback, useRef} from 'react'
import {useLocation} from 'react-router-dom'
import {
  Menu,
  MenuItem,
  SvgIcon,
  Typography,
  Slider,
  Box,
  Divider,
} from '@mui/material'
import {Close as CloseIcon} from '@mui/icons-material'
import {Layers} from 'lucide-react'
import useStore from '../../store/useStore'
import FloorPlanManager from './FloorPlanManager'
import {getFloorFromHash, addFloorToHash, removeFloorFromHash} from './hashState'
import {TooltipIconButton} from '../Buttons'
import debug from '../../utils/debug'
import LevelsIcon from '../../assets/icons/Levels.svg'


/**
 * Floor Plan control with storey selector and cut height slider.
 *
 * @return {ReactElement}
 */
export default function FloorPlanControl() {
  const viewer = useStore((state) => state.viewer)
  const model = useStore((state) => state.model)
  const isModelReady = useStore((state) => state.isModelReady)

  const isFloorPlanMode = useStore((state) => state.isFloorPlanMode)
  const setIsFloorPlanMode = useStore((state) => state.setIsFloorPlanMode)
  const currentFloorIndex = useStore((state) => state.currentFloorIndex)
  const setCurrentFloorIndex = useStore((state) => state.setCurrentFloorIndex)
  const floors = useStore((state) => state.floors)
  const setFloors = useStore((state) => state.setFloors)
  const floorPlanCutHeight = useStore((state) => state.floorPlanCutHeight)
  const setFloorPlanCutHeight = useStore((state) => state.setFloorPlanCutHeight)

  const [anchorEl, setAnchorEl] = useState(null)
  const managerRef = useRef(null)
  const initedRef = useRef(false)

  const location = useLocation()
  const isMenuVisible = Boolean(anchorEl)

  // Initialize once when model is ready
  useEffect(() => {
    if (!viewer || !model || !isModelReady || initedRef.current) return
    initedRef.current = true

    const mgr = new FloorPlanManager(viewer, model)
    managerRef.current = mgr

    mgr.getFloors().then((foundFloors) => {
      if (foundFloors.length > 0) {
        setFloors(foundFloors)
        debug().log('FloorPlanControl: Found', foundFloors.length, 'floors')

        const hashFloor = getFloorFromHash(location)
        if (hashFloor !== null && hashFloor < foundFloors.length) {
          mgr.enterFloorPlan(foundFloors[hashFloor], 1.2)
          setCurrentFloorIndex(hashFloor)
          setIsFloorPlanMode(true)
        }
      }
    })

    return () => {
      mgr.dispose()
      managerRef.current = null
      initedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, model, isModelReady])

  const selectFloor = useCallback((index) => {
    const mgr = managerRef.current
    if (!mgr || index < 0 || index >= floors.length) return

    mgr.enterFloorPlan(floors[index], floorPlanCutHeight)
    setCurrentFloorIndex(index)
    setIsFloorPlanMode(true)
    addFloorToHash(index)
    setAnchorEl(null)
  }, [floors, floorPlanCutHeight, setCurrentFloorIndex, setIsFloorPlanMode])

  const exitFloorPlan = useCallback(() => {
    const mgr = managerRef.current
    if (mgr) mgr.exitFloorPlan()
    setIsFloorPlanMode(false)
    setCurrentFloorIndex(null)
    removeFloorFromHash()
    setAnchorEl(null)
  }, [setIsFloorPlanMode, setCurrentFloorIndex])

  const handleCutHeightChange = useCallback((event, value) => {
    setFloorPlanCutHeight(value)
    const mgr = managerRef.current
    if (mgr && currentFloorIndex !== null && floors[currentFloorIndex]) {
      mgr.updateCutHeight(floors[currentFloorIndex], value)
    }
  }, [currentFloorIndex, floors, setFloorPlanCutHeight])

  // Escape key
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && isFloorPlanMode) exitFloorPlan()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFloorPlanMode, exitFloorPlan])

  if (!floors.length && !isFloorPlanMode) return null

  const currentFloor = currentFloorIndex !== null ? floors[currentFloorIndex] : null
  const maxCutHeight = currentFloor
    ? Math.max(1, currentFloor.nextElevation - currentFloor.elevation)
    : 3

  // Flat array of children — MUI Menu rejects Fragments
  const menuItems = [
    <Box key='hdr' sx={{px: 2, py: 0.5}}>
      <Typography variant='caption' sx={{opacity: 0.6, textTransform: 'uppercase', fontSize: '10px'}}>
        Floor Plans
      </Typography>
    </Box>,
    ...floors.map((floor, i) => (
      <MenuItem
        key={`f-${i}`}
        onClick={() => selectFloor(i)}
        selected={currentFloorIndex === i}
        data-testid={`floor-plan-item-${i}`}
      >
        <Typography sx={{flexGrow: 1}}>{floor.name}</Typography>
        <Typography variant='caption' sx={{opacity: 0.5, ml: 2}}>
          {floor.elevation.toFixed(1)}m
        </Typography>
      </MenuItem>
    )),
  ]

  if (isFloorPlanMode) {
    menuItems.push(
      <Divider key='d1' sx={{my: 0.5}}/>,
      <Box key='ch' sx={{px: 2, py: 1}}>
        <Typography variant='caption' sx={{opacity: 0.6, fontSize: '10px'}}>
          CUT HEIGHT: {floorPlanCutHeight.toFixed(1)}m
        </Typography>
        <Slider
          size='small'
          value={floorPlanCutHeight}
          min={0.1}
          max={maxCutHeight}
          step={0.1}
          onChange={handleCutHeightChange}
          data-testid='floor-plan-cut-height'
          sx={{mt: 0.5}}
        />
      </Box>,
      <Divider key='d2' sx={{my: 0.5}}/>,
      <MenuItem key='exit' onClick={exitFloorPlan} data-testid='floor-plan-exit'>
        <CloseIcon sx={{mr: 1, fontSize: 18}}/>
        <Typography>Exit Floor Plan</Typography>
      </MenuItem>,
    )
  }

  return (
    <>
      <TooltipIconButton
        title='Floor Plans'
        icon={<Layers size={18} strokeWidth={1.75}/>}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        selected={isFloorPlanMode}
        variant='control'
        placement='top'
        dataTestId='control-button-floor-plan'
      />
      <Menu
        elevation={1}
        anchorEl={anchorEl}
        open={isMenuVisible}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{vertical: 'top', horizontal: 'center'}}
        transformOrigin={{vertical: 'bottom', horizontal: 'center'}}
        data-testid='menu-floor-plan'
        slotProps={{paper: {sx: {minWidth: 200}}}}
      >
        {menuItems}
      </Menu>
    </>
  )
}
