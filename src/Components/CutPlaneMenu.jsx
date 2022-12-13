import React, {useState, useEffect} from 'react'
import {Vector3} from 'three'
import {useLocation} from 'react-router-dom'
import useStore from '../store/useStore'
import {addHashParams, getHashParams, removeHashParams} from '../utils/location'
import {TooltipIconButton} from './Buttons'
import CutPlaneIcon from '../assets/2D_Icons/CutPlane.svg'
import {assertDefined} from '../utils/assert'

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
  const location = useLocation()

  const PLANE_PREFIX = 'p'
  let planeOffsetX = 0
  let planeOffsetY = 0
  let planeOffsetZ = 0

  useEffect(() => {
    const planeHash = getHashParams(location, 'p')
    if (planeHash && model && viewer) {
      const planeInfo = planeHash.split(':')[1].split(',')
      const planeNormal = planeInfo[0]
      const normalOffset = planeInfo[1]
      const planes = ['x', 'y', 'z'].includes(planeNormal)
      if (planes) {
        createPlane(planeNormal, normalOffset)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])

  const createPlane = (normalDirection, offset = 0) => {
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
        planeOffsetX = parseFloat(offset)
        break
      case 'y':
        normal = new Vector3(0, -1, 0)
        planeOffsetY = parseFloat(offset)
        break
      case 'z':
        normal = new Vector3(0, 0, -1)
        planeOffsetZ = parseFloat(offset)
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
    setCutPlaneDirection(normalDirection)
    return viewer.clipper.createFromNormalAndCoplanarPoint(normal, modelCenterOffset)
  }

  const handleClick = (event) => {
    createPlane('y')
  }

  return (
    <div>
      <TooltipIconButton
        title={'Plan'}
        icon={<CutPlaneIcon/>}
        onClick={handleClick}
        selected={anchorEl !== null || cutPlaneDirection !== null}
      />
    </div>
  )
}


/* eslint-disable no-magic-numbers */
/**
 * getModelCenter returns the center of the model based on bounding box
 *
 * @param {object} ifcModel current model
 * @return {object} centerCoordinates
 */
export function getModelCenter(ifcModel) {
  assertDefined(ifcModel, ifcModel.geometry, ifcModel.geometry.boundingBox,
      ifcModel.geometry.boundingBox.max, ifcModel.geometry.boundingBox.min)
  const modelCenter = new Vector3(
      (ifcModel.geometry.boundingBox.max.x +
      ifcModel.geometry.boundingBox.min.x) /
    2,
      (ifcModel.geometry.boundingBox.max.y +
      ifcModel.geometry.boundingBox.min.y) /
    2,
      (ifcModel.geometry.boundingBox.max.z +
      ifcModel.geometry.boundingBox.min.z) /
    2,
  )
  console.log('model center', modelCenter.getComponent)
  return modelCenter
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
    const modelCenter = getModelCenter(ifcModel)
    console.log('model center', modelCenter)
    for (const [key, value] of Object.entries(viewer.clipper.planes[0].plane.normal)) {
      if (value !== 0 ) {
        planeNormal = key
        planeAxisCenter = modelCenter[planeNormal]
        planeOffsetFromCenter = planeOffsetFromModelBoundary - planeAxisCenter
        const planeOffsetFromCenterTrim = planeOffsetFromCenter
        planeHash = `${planeNormal},${planeOffsetFromCenterTrim}`
      }
    }
    const planeOffsetObj = {planeAxis: planeHash}
    return planeOffsetObj
  }
  return null
}


/**
 * helper method to add plane normal and the offset to the url as a hash parameter
 *
 * @param {object} viewer
 * @param {object} ifcModel
 * @return {object} add plane to url
 */
export function addPlaneLocationToUrl(viewer, ifcModel) {
  const PLANE_PREFIX = 'p'
  if (viewer.clipper.planes.length > 0) {
    const planeOffset = getPlaneOffset(viewer, ifcModel)
    return addHashParams(window.location, PLANE_PREFIX, planeOffset)
  }
}
