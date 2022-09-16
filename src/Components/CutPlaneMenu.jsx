import React, {useState, useEffect} from 'react'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import {Vector3} from 'three'
import {useLocation} from 'react-router-dom'
import CutPlaneIcon from '../assets/2D_Icons/CutPlane.svg'
import useStore from '../store/useStore'
import {TooltipIconButton} from './Buttons'
import {getModelCenter} from '../utils/cutPlane'
import {addHashParams, getHashParams, removeHashParams} from '../utils/location'
import useTheme from '../Theme'

/**
 * BasicMenu used when there are several option behind UI button
 * show/hide from the right of the screen.
 *
 * @param {Array} listOfOptions Title for the drawer
 * @return {object} ItemPropertiesDrawer react component
 */
export default function CutPlaneMenu() {
  const [anchorEl, setAnchorEl] = useState(null)
  const [cutPlaneDirection, setCutPlaneDirection] = useState('')
  const open = Boolean(anchorEl)
  const model = useStore((state) => state.modelStore)
  const theme = useTheme()
  const PLANE_PREFIX = 'p'

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget)
  }
  const handleClose = () => {
    setAnchorEl(null)
  }
  const viewer = useStore((state) => state.viewerStore)
  const location = useLocation()

  const createPlane = (normalDirection) => {
    viewer.clipper.deleteAllPlanes()
    const modelCenter = getModelCenter(model)
    const planeHash = getHashParams(location, 'p')
    if (normalDirection === cutPlaneDirection) {
      viewer.clipper.deleteAllPlanes()
      removeHashParams(window.location, PLANE_PREFIX)
      setCutPlaneDirection('')
      return
    }
    let normal
    switch (normalDirection) {
      case 'x':
        normal = new Vector3(-1, 0, 0)
        break
      case 'y':
        normal = new Vector3(0, -1, 0)
        break
      case 'z':
        normal = new Vector3(0, 0, -1)
        break
      default:
        normal = new Vector3(0, 1, 0)
        break
    }
    if (!planeHash || planeHash !== normalDirection ) {
      addHashParams(window.location, PLANE_PREFIX, {planeAxis: normalDirection})
    }
    setCutPlaneDirection(normalDirection)
    return viewer.clipper.createFromNormalAndCoplanarPoint(normal, modelCenter)
  }

  useEffect(() => {
    const planeHash = getHashParams(location, 'p')
    if (planeHash && model && viewer) {
      const planeDirection = planeHash.split(':')[1]
      createPlane(planeDirection)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])

  return (
    <div>
      <TooltipIconButton
        title={'Section'}
        icon={<CutPlaneIcon/>}
        onClick={handleClick}
        selected={anchorEl !== null}
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
