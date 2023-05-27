/* eslint-disable no-magic-numbers */
import React, {useState} from 'react'
import {useLocation} from 'react-router-dom'
import {Vector3} from 'three'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import useTheme from '@mui/styles/useTheme'
import useStore from '../store/useStore'
import debug from '../utils/debug'
import {addHashParams, getObjectParams, removeHashParams} from '../utils/location'
import {floatStrTrim, isNumeric} from '../utils/strings'
import {TooltipIconButton} from './Buttons'
import ViewIcon from '../assets/icons/View.svg'
import BackIcon from '../assets/icons/view/Back.svg'
import FrontIcon from '../assets/icons/view/Front.svg'
import TopIcon from '../assets/icons/view/Top.svg'
import BottomIcon from '../assets/icons/view/Bottom.svg'
import RightIcon from '../assets/icons/view/Right.svg'
import LeftIcon from '../assets/icons/view/Left.svg'


const PLANE_PREFIX = 'p'


/**
 * BasicMenu used when there are several option behind UI button
 * show/hide from the right of the screen.
 *
 * @param {Array} listOfOptions Title for the drawer
 * @return {object} ItemPropertiesDrawer react component
 */
export default function ViewMenu() {
  const [anchorEl, setAnchorEl] = useState(null)
  const viewer = useStore((state) => state.viewerStore)
  const cutPlanes = useStore((state) => state.cutPlanes)
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


  return (
    <>
      <TooltipIconButton
        title={'Views'}
        icon={<ViewIcon/>}
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
            left: '240px',
            transform: 'translateX(-70px)',
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
            title={`Top`}
            placement={'left'}
            onClick={() => {
              viewer.IFC.context.ifcCamera.cameraControls.setPosition(100, 100, 100, true)
            }}
            selected={cutPlanes.findIndex((cutPlane) => cutPlane.direction === 'y') > -1}
            icon={<TopIcon style={{width: '30px', height: '30px'}}/>}
          />
        </MenuItem>
        <MenuItem>
          <TooltipIconButton
            title={`Bottom`}
            placement={'left'}
            onClick={() => {
              viewer.IFC.context.ifcCamera.cameraControls.setPosition(100, 150, 100, true)
            }}
            selected={cutPlanes.findIndex((cutPlane) => cutPlane.direction === 'y') > -1}
            icon={<BottomIcon style={{width: '30px', height: '30px'}}/>}
          />
        </MenuItem>
        <MenuItem>
          <TooltipIconButton
            title={`Front`}
            placement={'left'}
            onClick={() => {
              viewer.IFC.context.ifcCamera.cameraControls.setPosition(90, 100, 100, true)
            }}
            selected={cutPlanes.findIndex((cutPlane) => cutPlane.direction === 'y') > -1}
            icon={<FrontIcon style={{width: '18px', height: '30px'}}/>}
          />
        </MenuItem>
        <MenuItem>
          <TooltipIconButton
            title={`Back`}
            placement={'left'}
            onClick={() => {
              viewer.IFC.context.ifcCamera.cameraControls.setPosition(200, 100, 100, true)
            }}
            selected={cutPlanes.findIndex((cutPlane) => cutPlane.direction === 'y') > -1}
            icon={<BackIcon style={{width: '19px', height: '30px'}}/>}
          />
        </MenuItem>
        <MenuItem>
          <TooltipIconButton
            title={`Left`}
            placement={'left'}
            onClick={() => {
              viewer.IFC.context.ifcCamera.cameraControls.setPosition(100, 100, 200, true)
            }}
            selected={cutPlanes.findIndex((cutPlane) => cutPlane.direction === 'y') > -1}
            icon={<LeftIcon style={{width: '19px', height: '30px'}}/>}
          />
        </MenuItem>
        <MenuItem>
          <TooltipIconButton
            title={`Right`}
            placement={'left'}
            onClick={() => {
              viewer.IFC.context.ifcCamera.cameraControls.setPosition(100, 0, 100, true)
            }}
            selected={cutPlanes.findIndex((cutPlane) => cutPlane.direction === 'y') > -1}
            icon={<RightIcon style={{width: '18px', height: '30px'}}/>}
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
