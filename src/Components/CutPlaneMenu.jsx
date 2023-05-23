import React, {useState, useEffect} from 'react'
import {useLocation} from 'react-router-dom'
import {Vector3} from 'three'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import useTheme from '@mui/styles/useTheme'
import useStore from '../store/useStore'
import debug from '../utils/debug'
import {addHashParams, getHashParams, getObjectParams, removeHashParams} from '../utils/location'
import {floatStrTrim, isNumeric} from '../utils/strings'
import {TooltipIconButton} from './Buttons'
import CutPlaneIcon from '../assets/icons/CutPlane.svg'
import ElevationIcon from '../assets/icons/Elevation.svg'
import PlanIcon from '../assets/icons/Plan.svg'
import SectionIcon from '../assets/icons/Section.svg'


const PLANE_PREFIX = 'p'


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
  const cutPlanes = useStore((state) => state.cutPlanes)
  const addCutPlaneDirection = useStore((state) => state.addCutPlaneDirection)
  const removeCutPlaneDirection = useStore((state) => state.removeCutPlaneDirection)
  const setLevelInstance = useStore((state) => state.setLevelInstance)
  const location = useLocation()
  const open = Boolean(anchorEl)
  const theme = useTheme()

  debug().log('CutPlaneMenu: location: ', location)
  debug().log('CutPlaneMenu: cutPlanes: ', cutPlanes)


  const handleClick = (event) => {
    setAnchorEl(event.currentTarget)
  }


  const handleClose = () => {
    setAnchorEl(null)
  }


  useEffect(() => {
    const planeHash = getHashParams(location, 'p')
    debug().log('CutPlaneMenu#useEffect: planeHash: ', planeHash)
    if (planeHash && model && viewer) {
      const planes = getPlanes(planeHash)
      debug().log('CutPlaneMenu#useEffect: planes: ', planes)
      if (planes && planes.length) {
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
      removeHashParams(window.location, PLANE_PREFIX, [direction])
      removeCutPlaneDirection(direction)
      viewer.clipper.deleteAllPlanes()
      const restCutPlanes = cutPlanes.filter((cutPlane) => cutPlane.direction !== direction)
      restCutPlanes.forEach((restCutPlane) => {
        const planeInfo = getPlaneSceneInfo({modelCenter, direction: restCutPlane.direction, offset: restCutPlane.offset})
        viewer.clipper.createFromNormalAndCoplanarPoint(planeInfo.normal, planeInfo.modelCenterOffset)
      })
    } else {
      debug().log('CutPlaneMenu#togglePlane: found: ', false)
      addHashParams(window.location, PLANE_PREFIX, {[direction]: offset}, true)
      addCutPlaneDirection({direction, offset})
      viewer.clipper.createFromNormalAndCoplanarPoint(normal, modelCenterOffset)
    }
  }


  return (
    <>
      <TooltipIconButton
        title={'Sections'}
        icon={<CutPlaneIcon/>}
        onClick={handleClick}
        selected={anchorEl !== null || !!cutPlanes.length}
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
            left: '240px',
            transform: 'translateX(-60px)',
            opacity: .8,
            background: theme.palette.background.control,
            zIndex: 10,
          },
          sx: {
            'color': theme.palette.primary.contrastText,
            '& .Mui-selected': {
              color: theme.palette.secondary.main,
              fontWeight: 800,
            },
            '.MuiMenuItem-root:hover': {
              backgroundColor: 'transparent',
            },
            '.MuiMenuItem-root': {
              padding: '0px',
            },
            '.MuiMenu-paper': {
              padding: '0px',
            },
            '.MuiList-padding': {
              padding: '0px',
            },
          },
        }}
      >
        <MenuItem>
          <TooltipIconButton
            title={`Plan`}
            placement={'left'}
            onClick={() => {
              togglePlane({direction: 'y'})
              handleClose()
            }}
            selected={cutPlanes.findIndex((cutPlane) => cutPlane.direction === 'y') > -1}
            icon={<PlanIcon style={{width: '25px', height: '30px'}}/>}
          />
        </MenuItem>
        <MenuItem>
          <TooltipIconButton
            title={`Elevation`}
            placement={'left'}
            onClick={() => {
              togglePlane({direction: 'z'})
              handleClose()
            }}
            selected={cutPlanes.findIndex((cutPlane) => cutPlane.direction === 'z') > -1}
            icon={<ElevationIcon style={{width: '19px', height: '30px', marginLeft: '4px'}}/>}
          />
        </MenuItem>
        <MenuItem>
          <TooltipIconButton
            title={`Section`}
            placement={'left'}
            onClick={() => {
              togglePlane({direction: 'x'})
              handleClose()
            }}
            selected={cutPlanes.findIndex((cutPlane) => cutPlane.direction === 'x') > -1}
            icon={<SectionIcon style={{width: '21px', height: '30px'}}/>}
          />
        </MenuItem>
      </Menu>
    </>
  )
}


/**
 * removePlanes delete all section planes from the viewer
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
 * Helper method to get the location of cut plane from the center of the model.
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
 * helper method to add plane normal and the offset to the url as a hash parameter
 *
 * @param {object} viewer
 * @param {object} ifcModel
 */
export function addPlaneLocationToUrl(viewer, ifcModel) {
  if (viewer.clipper.planes.length > 0) {
    const planeInfo = getPlanesOffset(viewer, ifcModel)
    debug().log('CutPlaneMenu#addPlaneLocationToUrl: planeInfo: ', planeInfo)
    addHashParams(window.location, PLANE_PREFIX, planeInfo, true)
  }
}


/**
 * get offset info of x, y, z from plane hash string
 *
 * @param {string} planeHash
 * @return {Array}
 */
export function getPlanes(planeHash) {
  if (!planeHash) {
    return []
  }
  const parts = planeHash.split(':')
  if (parts[0] !== 'p' || !parts[1]) {
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
      removeHashParams(window.location, PLANE_PREFIX, removableParamKeys)
    }
  })
  debug().log('CutPlaneMenu#getPlanes: planes: ', planes)
  return planes
}


/**
 * get plane information (normal, model center offset)
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

  const modelCenterOffset = new Vector3(modelCenter.x + planeOffsetX, modelCenter.y + planeOffsetY, modelCenter.z + planeOffsetZ)
  return {normal, modelCenterOffset}
}
