import React, {useState, useEffect} from 'react'
import {useLocation} from 'react-router-dom'
import {Vector3} from 'three'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import useTheme from '../Theme'
import useStore from '../store/useStore'
import {addHashParams, getHashParams, removeHashParams} from '../utils/location'
import {TooltipIconButton} from './Buttons'
import CutPlaneIcon from '../assets/2D_Icons/CutPlane.svg'
import {floatStrTrim} from '../utils/strings'


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
  const setCutPlaneOffset = useStore((state) => state.setCutPlaneOffset)
  const setLevelInstance = useStore((state) => state.setLevelInstance)
  const location = useLocation()

  const PLANE_PREFIX = 'p'
  let planeOffsetX = 0
  let planeOffsetY = 0
  let planeOffsetZ = 0

  const open = Boolean(anchorEl)
  const theme = useTheme()


  const handleClick = (event) => {
    setAnchorEl(event.currentTarget)
  }


  const handleClose = () => {
    setAnchorEl(null)
  }


  useEffect(() => {
    const planeHash = getHashParams(location, 'p')
    if (planeHash && model && viewer) {
      const planeInfo = planeHash.split(':')[1].split('=')
      const planeNormal = planeInfo[0]
      const normalOffset = planeInfo[1]
      const planes = ['x', 'y', 'z'].includes(planeNormal)
      setCutPlaneOffset(normalOffset)
      if (planes) {
        createPlane(planeNormal, normalOffset)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])


  const createPlane = (normalDirection, offset = 0) => {
    viewer.clipper.deleteAllPlanes()
    setLevelInstance(null)
    const modelCenter = new Vector3
    model?.geometry.boundingBox.getCenter(modelCenter)
    setAnchorEl(null)
    if (normalDirection === cutPlaneDirection) {
      viewer.clipper.deleteAllPlanes()
      removeHashParams(window.location, PLANE_PREFIX)
      setCutPlaneDirection(null)
      return
    }
    let normal
    const finiteOffset = floatStrTrim(offset)
    switch (normalDirection) {
      case 'x':
        normal = new Vector3(-1, 0, 0)
        planeOffsetX = finiteOffset
        break
      case 'y':
        normal = new Vector3(0, -1, 0)
        planeOffsetY = finiteOffset
        break
      case 'z':
        normal = new Vector3(0, 0, -1)
        planeOffsetZ = finiteOffset
        break
      default:
        normal = new Vector3(0, 1, 0)
        break
    }
    const modelCenterOffset = new Vector3(modelCenter.x + planeOffsetX, modelCenter.y + planeOffsetY, modelCenter.z + planeOffsetZ)
    const planeHash = getHashParams(location, 'p')
    if (!planeHash || planeHash !== normalDirection) {
      addHashParams(window.location, PLANE_PREFIX, {planeAxis: normalDirection})
    }
    setCutPlaneDirection(normalDirection)
    return viewer.clipper.createFromNormalAndCoplanarPoint(normal, modelCenterOffset)
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


/**
 * removePlanes delete all section planes from the viewer
 *
 * @param {object} viewer bouding box
 */
export function removePlanes(viewer) {
  viewer?.clipper.deleteAllPlanes()
  const clippingPlanes = viewer?.clipper['context'].clippingPlanes
  for (const plane of clippingPlanes) {
    viewer?.clipper['context'].removeClippingPlane(plane)
  }
}


/**
 * helper method to get the location of cut plane from the center of the model
 *
 * @param {object} viewer
 * @param {object} ifcModel
 * @return {object} offsetObj contains plane normal access as a key and offset as a value
 */
export function getPlaneOffset(viewer, ifcModel) {
  if (viewer.clipper.planes.length > 0) {
    let planeNormal
    let planeAxisCenter
    let planeOffsetFromCenter
    let planeHash
    const planeOffsetFromModelBoundary = viewer.clipper.planes[0].plane.constant
    const modelCenter = new Vector3
    ifcModel?.geometry.boundingBox.getCenter(modelCenter)
    for (const [key, value] of Object.entries(viewer.clipper.planes[0].plane.normal)) {
      if (value !== 0) {
        planeNormal = key
        planeAxisCenter = modelCenter[planeNormal]
        planeOffsetFromCenter = planeOffsetFromModelBoundary - planeAxisCenter
        planeHash = `${planeNormal}=${planeOffsetFromCenter}`
      }
    }
    const planeOffsetObj = {planeAxis: planeHash}
    return planeOffsetObj
  }
}


/**
 * helper method to add plane normal and the offset to the url as a hash parameter
 *
 * @param {object} viewer
 * @param {object} ifcModel
 */
export function addPlaneLocationToUrl(viewer, ifcModel) {
  const PLANE_PREFIX = 'p'
  if (viewer.clipper.planes.length > 0) {
    const planeOffset = getPlaneOffset(viewer, ifcModel)
    addHashParams(window.location, PLANE_PREFIX, planeOffset)
  }
}
