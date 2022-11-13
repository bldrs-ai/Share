import React, {useState, useEffect} from 'react'
import {Vector3} from 'three'
import {useLocation} from 'react-router-dom'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import useStore from '../store/useStore'
import useTheme from '../Theme'
import {addHashParams, getHashParams, removeHashParams} from '../utils/location'
import {getModelCenter} from '../utils/cutPlane'
import {TooltipIconButton} from './Buttons'
import CutPlaneIcon from '../assets/2D_Icons/CutPlane.svg'

/**
 * BasicMenu used when there are several option behind UI button
 * show/hide from the right of the screen.
 *
 * @param {Array} listOfOptions Title for the drawer
 * @return {object} ItemPropertiesDrawer react component
 */
export default function CutPlaneMenu() {
  const [anchorEl, setAnchorEl] = useState(null)
  const model = useStore((state) => state.modelStore)
  const viewer = useStore((state) => state.viewerStore)
  const cutPlaneDirection = useStore((state) => state.cutPlaneDirection)
  const setCutPlaneDirection = useStore((state) => state.setCutPlaneDirection)
  const setLevelInstance = useStore((state) => state.setLevelInstance)
  const open = Boolean(anchorEl)
  const theme = useTheme()
  const location = useLocation()

  const PLANE_PREFIX = 'p'
  let planeOffsetX = 0
  let planeOffsetY = 0
  let planeOffsetZ = 0

  useEffect(() => {
    const planeHash = getHashParams(location, 'p')
    if (planeHash && model && viewer) {
      const planeInfo = planeHash.split(':')[1]
      const planeNormal = planeInfo[0]
      const normalOffset = planeInfo[2]
      const planes = ['x', 'y', 'z'].includes(planeNormal)
      if (planes) {
        createPlane(planeNormal, normalOffset)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])

  const createPlane = (normalDirection, offset = 0) => {
    console.log('normalDirection', normalDirection, 'offset', offset)
    viewer.clipper.deleteAllPlanes()
    setLevelInstance(null)
    const modelCenter = getModelCenter(model)
    setAnchorEl(null)
    if (normalDirection === cutPlaneDirection) {
      viewer.clipper.deleteAllPlanes()
      removeHashParams(window.location, PLANE_PREFIX)
      setCutPlaneDirection(null)
      return
    }
    let normal
    switch (normalDirection) {
      case 'x':
        normal = new Vector3(-1, 0, 0)
        planeOffsetX = offset
        break
      case 'y':
        normal = new Vector3(0, -1, 0)
        planeOffsetY = offset
        break
      case 'z':
        normal = new Vector3(0, 0, -1)
        planeOffsetZ = offset
        break
      default:
        normal = new Vector3(0, 1, 0)
        break
    }
    const modelCenterOffset = new Vector3(modelCenter.x + planeOffsetX, modelCenter.y + planeOffsetY, modelCenter.z + planeOffsetZ)
    const planeHash = getHashParams(location, 'p')
    if (!planeHash || planeHash !== normalDirection ) {
      addHashParams(window.location, PLANE_PREFIX, {planeAxis: normalDirection})
    }
    console.log('modelCenterOffset', modelCenterOffset)
    setCutPlaneDirection(normalDirection)
    // do in the separate handler --
    // use the same trim as camera --precision - put into global
    return viewer.clipper.createFromNormalAndCoplanarPoint(normal, modelCenterOffset)
  }

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  return (
    <div>
      <TooltipIconButton
        title={'Section'}
        icon={<CutPlaneIcon/>}
        onClick={handleClick}
        selected={anchorEl !== null || cutPlaneDirection !== null}
      />
      <Menu
        elevation={1}
        id='basic-menu'
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{vertical: 'top', horizontal: 'center'}}
        transformOrigin={{vertical: 'top', horizontal: 'center'}}
        PaperProps={{
          style: {
            left: '300px',
            transform: 'translateX(-50px)',
          },
          sx: {
            '& .Mui-selected': {
              color: theme.theme.palette.highlight.main,
              fontWeight: 600,
            },
          },
        }}
      >
        <MenuItem onClick={() => createPlane('x')} selected={cutPlaneDirection === 'x'}> X</MenuItem>
        <MenuItem onClick={() => createPlane('y')} selected={cutPlaneDirection === 'y'}>Y</MenuItem>
        <MenuItem onClick={() => createPlane('z')} selected={cutPlaneDirection === 'z'}>Z</MenuItem>
      </Menu>
    </div>
  )
}
