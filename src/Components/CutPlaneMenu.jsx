import React, {ReactElement, useState, useEffect} from 'react'
import {useLocation} from 'react-router-dom'
import {Vector3} from 'three'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import useStore from '../store/useStore'
import debug from '../utils/debug'
import {addHashParams, getHashParams, getObjectParams, removeHashParams} from '../utils/location'
import {floatStrTrim, isNumeric} from '../utils/strings'
import {TooltipIconButton} from './Buttons'
import CloseIcon from '@mui/icons-material/Close'
import CropOutlinedIcon from '@mui/icons-material/CropOutlined'
import ElevationIcon from '../assets/icons/Elevation.svg'
import PlanIcon from '../assets/icons/Plan.svg'
import SectionIcon from '../assets/icons/Section.svg'


/**
 * Menu of three cut planes for the model
 *
 * @return {ReactElement}
 */
export default function CutPlaneMenu() {
  const [anchorEl, setAnchorEl] = useState(null)
  const model = useStore((state) => state.model)
  const viewer = useStore((state) => state.viewer)
  const cutPlanes = useStore((state) => state.cutPlanes)
  const addCutPlaneDirection = useStore((state) => state.addCutPlaneDirection)
  const removeCutPlaneDirection = useStore((state) => state.removeCutPlaneDirection)
  const setLevelInstance = useStore((state) => state.setLevelInstance)
  const setCutPlaneDirections = useStore((state) => state.setCutPlaneDirections)
  const location = useLocation()
  const isMenuVisible = Boolean(anchorEl)
  const [isCutplane, setIsCutPlane] = useState(false)

  debug().log('CutPlaneMenu: location: ', location)
  debug().log('CutPlaneMenu: cutPlanes: ', cutPlanes)

  const handleClose = () => {
    setAnchorEl(null)
  }

  useEffect(() => {
    const planeHash = getHashParams(location, VIEW_PLANE_PREFIX)
    debug().log('CutPlaneMenu#useEffect: planeHash: ', planeHash)
    if (planeHash && model && viewer) {
      const planes = getPlanes(planeHash)
      debug().log('CutPlaneMenu#useEffect: planes: ', planes)
      if (planes && planes.length) {
        setIsCutPlane(true)
        planes.forEach((plane) => {
          togglePlane(plane)
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])

  const togglePlane = ({direction, offset = 0}) => {
    setLevelInstance(null)
    const modelCenter = new Vector3
    model?.geometry.boundingBox.getCenter(modelCenter)
    setAnchorEl(null)
    const {normal, modelCenterOffset} = getPlaneSceneInfo({modelCenter, direction, offset})
    debug().log('CutPlaneMenu#togglePlane: normal: ', normal)
    debug().log('CutPlaneMenu#togglePlane: modelCenterOffset: ', modelCenterOffset)
    debug().log('CutPlaneMenu#togglePlane: ifcPlanes: ', viewer.clipper.planes)

    if (cutPlanes.findIndex((cutPlane) => cutPlane.direction === direction) > -1) {
      debug().log('CutPlaneMenu#togglePlane: found: ', true)
      removeHashParams(window.location, VIEW_PLANE_PREFIX, [direction])
      removeCutPlaneDirection(direction)
      viewer.clipper.deleteAllPlanes()
      const restCutPlanes = cutPlanes.filter((cutPlane) => cutPlane.direction !== direction)
      setIsCutPlane(false)
      restCutPlanes.forEach((restCutPlane) => {
        const planeInfo = getPlaneSceneInfo({modelCenter, direction: restCutPlane.direction, offset: restCutPlane.offset})
        viewer.clipper.createFromNormalAndCoplanarPoint(planeInfo.normal, planeInfo.modelCenterOffset)
      })
    } else {
      debug().log('CutPlaneMenu#togglePlane: found: ', false)
      addHashParams(window.location, VIEW_PLANE_PREFIX, {[direction]: offset}, true)
      addCutPlaneDirection({direction, offset})
      viewer.clipper.createFromNormalAndCoplanarPoint(normal, modelCenterOffset)
    }
  }

  return (
    <>
      <TooltipIconButton
        title={'Section'}
        icon={<CropOutlinedIcon className='icon-share'/>}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        selected={anchorEl !== null || !!cutPlanes.length || isCutplane}
        variant='control'
        placement='top'
        buttonTestId='control-button-section'
      />
      <Menu
        elevation={1}
        id='basic-menu'
        anchorEl={anchorEl}
        open={isMenuVisible}
        onClose={handleClose}
        anchorOrigin={{vertical: 'top', horizontal: 'center'}}
        transformOrigin={{vertical: 'bottom', horizontal: 'center'}}
      >
        <MenuItem onClick={() => togglePlane({direction: 'y'})}
          selected={cutPlanes.findIndex((cutPlane) => cutPlane.direction === 'y') > -1}
        >
          <PlanIcon className='icon-share'/>
          <Typography sx={{marginLeft: '10px'}} variant='overline'>Plan</Typography>
        </MenuItem>
        <MenuItem onClick={() => togglePlane({direction: 'x'})}
          selected={cutPlanes.findIndex((cutPlane) => cutPlane.direction === 'x') > -1}
        >
          <SectionIcon className='icon-share'/>
          <Typography sx={{marginLeft: '10px'}} variant='overline'>Section</Typography>
        </MenuItem>
        <MenuItem onClick={() => togglePlane({direction: 'z'})}
          selected={cutPlanes.findIndex((cutPlane) => cutPlane.direction === 'z') > -1}
        >
          <ElevationIcon className='icon-share'/>
          <Typography sx={{marginLeft: '10px'}} variant='overline'>Elevation</Typography>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setCutPlaneDirections([])
            removePlanes(viewer)
            setAnchorEl(null)
            setIsCutPlane(false)
            removeHashParams(window.location, VIEW_PLANE_PREFIX, ['x', 'y', 'z'])
          } }
        >
          <CloseIcon className='icon-share'/>
          <Typography sx={{marginLeft: '10px'}} variant='overline'>Clear all</Typography>
        </MenuItem>
      </Menu>
    </>
  )
}


/**
 * Deletes all section planes from the viewer
 *
 * @param {object} viewer bounding box
 */
export function removePlanes(viewer) {
  viewer?.clipper.deleteAllPlanes()
  const clippingPlanes = viewer?.clipper['context'].clippingPlanes
  for (const plane of clippingPlanes) {
    viewer?.clipper['context'].removeClippingPlane(plane)
  }
}


/**
 * Get the location of cut plane from the center of the model
 *
 * @param {object} viewer
 * @param {object} ifcModel
 * @return {object} {x: 0, y: 0, ...}
 */
export function getPlanesOffset(viewer, ifcModel) {
  if (viewer.clipper.planes.length > 0) {
    let planeNormal
    let planeAxisCenter
    let planeOffsetFromCenter
    const planesOffset = {}
    const modelCenter = new Vector3
    ifcModel?.geometry.boundingBox.getCenter(modelCenter)
    debug().log('CutPlaneMenu#getPlanesOffset: modelCenter: ', modelCenter)
    viewer.clipper.planes.forEach((plane) => {
      for (const [key, value] of Object.entries(plane.plane.normal)) {
        if (value !== 0) {
          const planeOffsetFromModelBoundary = plane.plane.constant
          planeNormal = key
          planeAxisCenter = modelCenter[planeNormal]
          planeOffsetFromCenter = planeOffsetFromModelBoundary - planeAxisCenter
          planesOffset[planeNormal] = floatStrTrim(planeOffsetFromCenter)
        }
      }
    })
    return planesOffset
  }
  return undefined
}


/**
 * Add plane normal and the offset to the url as a hash parameter
 *
 * @param {object} viewer
 * @param {object} ifcModel
 */
export function addPlaneLocationToUrl(viewer, ifcModel) {
  if (viewer.clipper.planes.length > 0) {
    const planeInfo = getPlanesOffset(viewer, ifcModel)
    debug().log('CutPlaneMenu#addPlaneLocationToUrl: planeInfo: ', planeInfo)
    addHashParams(window.location, VIEW_PLANE_PREFIX, planeInfo, true)
  }
}


/**
 * Get offset info of x, y, z from plane hash string
 *
 * @param {string} planeHash
 * @return {Array}
 */
export function getPlanes(planeHash) {
  if (!planeHash) {
    return []
  }
  const parts = planeHash.split(':')
  if (parts[0] !== VIEW_PLANE_PREFIX || !parts[1]) {
    return []
  }
  const planeObjectParams = getObjectParams(planeHash)
  debug().log('CutPlaneMenu#getPlanes: planeObjectParams: ', planeObjectParams)
  const planes = []
  Object.entries(planeObjectParams).forEach((entry) => {
    const [key, value] = entry
    const removableParamKeys = []
    if (isNumeric(key)) {
      removableParamKeys.push(key)
    } else {
      planes.push({
        direction: key,
        offset: floatStrTrim(value),
      })
    }
    if (removableParamKeys.length) {
      removeHashParams(window.location, VIEW_PLANE_PREFIX, removableParamKeys)
    }
  })
  debug().log('CutPlaneMenu#getPlanes: planes: ', planes)
  return planes
}


/**
 * Get plane information (normal, model center offset)
 *
 * @param {Vector3} modelCenter
 * @param {string} direction
 * @param {number} offset
 * @return {object}
 */
export function getPlaneSceneInfo({modelCenter, direction, offset = 0}) {
  let normal
  let planeOffsetX = 0
  let planeOffsetY = 0
  let planeOffsetZ = 0
  const finiteOffset = floatStrTrim(offset)

  switch (direction) {
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

  const modelCenterOffset =
        new Vector3(
          modelCenter.x + planeOffsetX,
          modelCenter.y + planeOffsetY,
          modelCenter.z + planeOffsetZ)
  return {normal, modelCenterOffset}
}


export const VIEW_PLANE_PREFIX = 'vp'
