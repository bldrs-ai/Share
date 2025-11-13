import React, {ReactElement, useState, useEffect} from 'react'
import {useLocation} from 'react-router-dom'
import {Vector3, Box3} from 'three'
import {Menu, MenuItem, SvgIcon, Typography} from '@mui/material'
import useStore from '../../store/useStore'
import {GlbClipper} from '../../Infrastructure/GlbClipper'
import debug from '../../utils/debug'
import {addHashParams, getHashParams, getObjectParams, removeParams} from '../../utils/location'
import {floatStrTrim, isNumeric} from '../../utils/strings'
import {TooltipIconButton} from '../Buttons'
import {HASH_PREFIX_CUT_PLANE} from './hashState'
import {Close as CloseIcon, CropOutlined as CropOutlinedIcon} from '@mui/icons-material'
import ElevationIcon from '../../assets/icons/Elevation.svg'
import PlanIcon from '../../assets/icons/Plan.svg'
import SectionIcon from '../../assets/icons/Section.svg'



/**
 * Gets the center of a model's bounding box
 * Works for both IFC models (with geometry.boundingBox) and GLB models
 *
 * @param {object} model - The model object
 * @return {Vector3} The center point of the model
 */
function getModelCenter(model) {
  const modelCenter = new Vector3()

  if (model?.geometry?.boundingBox) {
    // IFC model with geometry.boundingBox
    model.geometry.boundingBox.getCenter(modelCenter)
  } else if (model) {
    // GLB or other model - compute bounding box
    const box = new Box3()
    box.setFromObject(model)
    box.getCenter(modelCenter)
  }

  return modelCenter
}


/**
 * Menu of three cut planes for the model
 *
 * @return {ReactElement}
 */
export default function CutPlaneMenu() {
  const model = useStore((state) => state.model)
  const viewer = useStore((state) => state.viewer)
  const cutPlanes = useStore((state) => state.cutPlanes)
  const addCutPlaneDirection = useStore((state) => state.addCutPlaneDirection)
  const removeCutPlaneDirection = useStore((state) => state.removeCutPlaneDirection)
  const setLevelInstance = useStore((state) => state.setLevelInstance)
  const setCutPlaneDirections = useStore((state) => state.setCutPlaneDirections)

  const isCutPlaneActive = useStore((state) => state.isCutPlaneActive)
  const setIsCutPlaneActive = useStore((state) => state.setIsCutPlaneActive)

  const [anchorEl, setAnchorEl] = useState(null)
  const [glbClipper, setGlbClipper] = useState(null)

  const location = useLocation()

  const isMenuVisible = Boolean(anchorEl)

  debug().log('CutPlaneMenu: location: ', location)
  debug().log('CutPlaneMenu: cutPlanes: ', cutPlanes)

  const handleClose = () => {
    setAnchorEl(null)
  }

  // Initialize GlbClipper when model changes
  useEffect(() => {
    if (model && viewer) {
      const isGlbModel = viewer.IFC.type === 'glb' || viewer.IFC.type === 'gltf'
      if (isGlbModel) {
        const clipper = new GlbClipper(viewer, model)
        setGlbClipper(clipper)
        viewer.glbClipper = clipper // Store on viewer for access in other functions
        debug().log('CutPlaneMenu: Initialized GlbClipper')

        return () => {
          clipper.dispose()
          setGlbClipper(null)
          delete viewer.glbClipper
        }
      }
    }
  }, [model, viewer])

  useEffect(() => {
    const planeHash = getHashParams(location, HASH_PREFIX_CUT_PLANE)
    debug().log('CutPlaneMenu#useEffect: planeHash: ', planeHash)
    if (planeHash && model && viewer) {
      const isGlbModel = viewer.IFC.type === 'glb' || viewer.IFC.type === 'gltf'

      // For GLB models, wait for glbClipper to be initialized
      if (isGlbModel && !glbClipper) {
        debug().log('CutPlaneMenu#useEffect: Waiting for glbClipper to initialize')
        return
      }

      const planes = getPlanes(planeHash)
      debug().log('CutPlaneMenu#useEffect: planes: ', planes)
      if (planes && planes.length) {
        setIsCutPlaneActive(true)
        planes.forEach((plane) => {
          togglePlane(plane)
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, glbClipper])

  const togglePlane = ({direction, offset = 0}) => {
    if (setLevelInstance) {
      setLevelInstance(null)
    }
    const modelCenter = getModelCenter(model)
    setAnchorEl(null)
    const {normal, modelCenterOffset} = getPlaneSceneInfo({modelCenter, direction, offset})
    debug().log('CutPlaneMenu#togglePlane: normal: ', normal)
    debug().log('CutPlaneMenu#togglePlane: modelCenterOffset: ', modelCenterOffset)

    const isGlbModel = viewer.IFC.type === 'glb' || viewer.IFC.type === 'gltf'

    if (cutPlanes.findIndex((cutPlane) => cutPlane.direction === direction) > -1) {
      debug().log('CutPlaneMenu#togglePlane: found: ', true)
      removeParams(HASH_PREFIX_CUT_PLANE, [direction])
      removeCutPlaneDirection(direction)

      if (isGlbModel && glbClipper) {
        // For GLB: use GlbClipper
        glbClipper.deleteAllPlanes()
      } else {
        // For IFC: use clipper
        viewer.clipper.deleteAllPlanes()
      }

      const restCutPlanes = cutPlanes.filter((cutPlane) => cutPlane.direction !== direction)
      restCutPlanes.forEach((restCutPlane) => {
        const planeInfo = getPlaneSceneInfo({modelCenter, direction: restCutPlane.direction, offset: restCutPlane.offset})

        if (isGlbModel && glbClipper) {
          // Create GLB clipping plane with controls
          glbClipper.createPlane(planeInfo.normal, planeInfo.modelCenterOffset, restCutPlane.direction, restCutPlane.offset)
        } else {
          viewer.clipper.createFromNormalAndCoplanarPoint(planeInfo.normal, planeInfo.modelCenterOffset)
        }
      })

      if (restCutPlanes.length === 0) {
        setIsCutPlaneActive(false)
      }
    } else {
      debug().log('CutPlaneMenu#togglePlane: found: ', false)
      addHashParams(window.location, HASH_PREFIX_CUT_PLANE, {[direction]: offset}, true)
      addCutPlaneDirection({direction, offset})

      if (isGlbModel && glbClipper) {
        // For GLB: use GlbClipper with drag controls
        glbClipper.createPlane(normal, modelCenterOffset, direction, offset)
      } else {
        // For IFC: use clipper
        viewer.clipper.createFromNormalAndCoplanarPoint(normal, modelCenterOffset)
      }

      setIsCutPlaneActive(true)
    }
  }

  return (
    <>
      <TooltipIconButton
        title={'Section'}
        icon={<CropOutlinedIcon className='icon-share'/>}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        selected={anchorEl !== null || !!cutPlanes.length || isCutPlaneActive}
        variant='control'
        placement='top'
        dataTestId='control-button-cut-plane'
      />
      <Menu
        elevation={1}
        id='basic-menu'
        anchorEl={anchorEl}
        open={isMenuVisible}
        onClose={handleClose}
        anchorOrigin={{vertical: 'top', horizontal: 'center'}}
        transformOrigin={{vertical: 'bottom', horizontal: 'center'}}
        data-testid='menu-cut-plane'
      >
        <MenuItem
          onClick={() => togglePlane({direction: 'y'})}
          selected={cutPlanes.findIndex((cutPlane) => cutPlane.direction === 'y') > -1}
          data-testid='menu-item-plan'
        >
          <SvgIcon><PlanIcon className='icon-share'/></SvgIcon>
          <Typography sx={{marginLeft: '10px'}} variant='overline'>Plan</Typography>
        </MenuItem>
        <MenuItem
          onClick={() => togglePlane({direction: 'x'})}
          selected={cutPlanes.findIndex((cutPlane) => cutPlane.direction === 'x') > -1}
          data-testid='menu-item-section'
        >
          <SvgIcon><SectionIcon className='icon-share'/></SvgIcon>
          <Typography sx={{marginLeft: '10px'}} variant='overline'>Section</Typography>
        </MenuItem>
        <MenuItem
          onClick={() => togglePlane({direction: 'z'})}
          selected={cutPlanes.findIndex((cutPlane) => cutPlane.direction === 'z') > -1}
          data-testid='menu-item-elevation'
        >
          <SvgIcon><ElevationIcon className='icon-share'/></SvgIcon>
          <Typography sx={{marginLeft: '10px'}} variant='overline'>Elevation</Typography>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchorEl(null)
            resetState(viewer, setCutPlaneDirections, setIsCutPlaneActive)
          }}
          data-testid='menu-item-clear-all'
        >
          <CloseIcon className='icon-share'/>
          <Typography sx={{marginLeft: '10px'}} variant='overline'>Clear all</Typography>
        </MenuItem>
      </Menu>
    </>
  )
}


/**
 * Called by this component and CadView for consistent reset
 *
 * @param {object} viewer
 * @param {Function} setCutPlaneDirections
 * @param {Function} setIsCutPlaneActive
 */
export function resetState(viewer, setCutPlaneDirections, setIsCutPlaneActive) {
  // These aren't setup when CadView inits
  if (viewer && viewer.clipper && setCutPlaneDirections && setIsCutPlaneActive) {
    removePlanes(viewer)
    removePlanesFromHashState()
    setCutPlaneDirections([])
    setIsCutPlaneActive(false)
  }
}


/**
 * Deletes all section planes from the viewer
 *
 * @param {object} viewer bounding box
 */
export function removePlanes(viewer) {
  const isGlbModel = viewer?.IFC?.type === 'glb' || viewer?.IFC?.type === 'gltf'

  if (isGlbModel && viewer.glbClipper) {
    // For GLB: use GlbClipper
    viewer.glbClipper.deleteAllPlanes()
  } else if (!isGlbModel) {
    // For IFC: use clipper
    viewer?.clipper.deleteAllPlanes()
    const clippingPlanes = viewer?.clipper['context'].clippingPlanes
    for (const plane of clippingPlanes) {
      viewer?.clipper['context'].removeClippingPlane(plane)
    }
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
  const isGlbModel = viewer?.IFC?.type === 'glb' || viewer?.IFC?.type === 'gltf'
  const planes = isGlbModel && viewer.glbClipper ? viewer.glbClipper.planes : viewer?.clipper?.planes

  if (planes && planes.length > 0) {
    let planeNormal
    let planeAxisCenter
    let planeOffsetFromCenter
    const planesOffset = {}
    const modelCenter = getModelCenter(ifcModel)
    debug().log('CutPlaneMenu#getPlanesOffset: modelCenter: ', modelCenter)

    planes.forEach((planeData) => {
      const plane = isGlbModel ? planeData.plane : planeData.plane
      const normal = plane.normal
      const constant = plane.constant

      for (const [key, value] of Object.entries(normal)) {
        if (value !== 0) {
          const planeOffsetFromModelBoundary = constant
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
 * Add plane normal and the offset to the hash state
 *
 * @param {object} viewer
 * @param {object} ifcModel
 */
export function addPlanesToHashState(viewer, ifcModel) {
  const isGlbModel = viewer?.IFC?.type === 'glb' || viewer?.IFC?.type === 'gltf'
  const planes = isGlbModel && viewer.glbClipper ? viewer.glbClipper.planes : viewer?.clipper?.planes

  if (planes && planes.length > 0) {
    const planeInfo = getPlanesOffset(viewer, ifcModel)
    debug().log('CutPlaneMenu#addPlaneLocationToUrl: planeInfo: ', planeInfo)
    addHashParams(window.location, HASH_PREFIX_CUT_PLANE, planeInfo, true)
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
  if (parts[0] !== HASH_PREFIX_CUT_PLANE || !parts[1]) {
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
      removeParams(HASH_PREFIX_CUT_PLANE, removableParamKeys)
    }
  })
  debug().log('CutPlaneMenu#getPlanes: planes: ', planes)
  return planes
}


/** Removes cut plane params from hash state */
export function removePlanesFromHashState() {
  removeParams(HASH_PREFIX_CUT_PLANE)
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
