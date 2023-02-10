import React, {useEffect, useState} from 'react'
import {useLocation} from 'react-router-dom'
import {Vector3} from 'three'
import {IFCBUILDINGSTOREY} from 'web-ifc'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import useTheme from '@mui/styles/useTheme'
import useStore from '../store/useStore'
import {addHashParams, getHashParams, removeHashParams} from '../utils/location'
import {isNumeric} from '../utils/strings'
import {TooltipIconButton} from './Buttons'
import LevelsIcon from '../assets/icons/Levels.svg'
import PlanViewIcon from '../assets/icons/PlanView.svg'


/**
 * BasicMenu used when there are several option behind UI button
 * show/hide from the right of the screen.
 *
 * @param {Array} listOfOptions Title for the drawer
 * @return {object} ItemPropertiesDrawer react component
 */
export default function ExtractLevelsMenu({listOfOptions, icon, title}) {
  const [anchorEl, setAnchorEl] = useState(null)
  const [allLevelsState, setAllLevelsState] = useState([])
  const model = useStore((state) => state.modelStore)
  const location = useLocation()
  const levelInstance = useStore((state) => state.levelInstance)
  const setLevelInstance = useStore((state) => state.setLevelInstance)
  const setCutPlaneDirections = useStore((state) => state.setCutPlaneDirections)
  const viewer = useStore((state) => state.viewerStore)
  const theme = useTheme()
  const open = Boolean(anchorEl)

  const LEVEL_PREFIX = 'p'
  const floorOffset = 0.2
  const ceilingOffset = 0.4


  useEffect(() => {
    // TODO(pablo): need to test getAllItemsOfType since it's null in
    // our mock.  Don't know how to mock the async function correctly.
    if (model && model.getAllItemsOfType) {
      const planeHash = getHashParams(location, 'p')
      const fetchFloors = async () => {
        const allLevels = await extractHeight(model)
        setAllLevelsState(allLevels)
        if (planeHash && model && viewer) {
          const levelHash = planeHash.split(':')[1]
          if (isNumeric(levelHash)) {
            const level = parseInt(levelHash)
            createFloorplanPlane(allLevels[level] + floorOffset, allLevels[level + 1] - ceilingOffset, level)
          }
        }
      }
      fetchFloors()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])


  const createFloorplanPlane = (planeHeightBottom, planeHeightTop, level) => {
    viewer.clipper.deleteAllPlanes()
    setCutPlaneDirections([])
    const levelHash = getHashParams(location, 'p')
    const modelCenter1 = new Vector3(0, planeHeightBottom, 0)
    const modelCenter2 = new Vector3(0, planeHeightTop, 0)
    const normal1 = new Vector3(0, 1, 0)
    const normal2 = new Vector3(0, -1, 0)
    viewer.clipper.createFromNormalAndCoplanarPoint(normal1, modelCenter1)
    viewer.clipper.createFromNormalAndCoplanarPoint(normal2, modelCenter2)
    if (planeHeightBottom === levelInstance) {
      viewer.clipper.deleteAllPlanes()
      removeHashParams(window.location, LEVEL_PREFIX)
      setLevelInstance(null)
      return
    }
    if (!levelHash || levelHash !== level) {
      addHashParams(window.location, LEVEL_PREFIX, {levelSelected: level})
    }
    setLevelInstance(planeHeightBottom)
  }


  const isolateFloor = (level) => {
    createFloorplanPlane(allLevelsState[level] + floorOffset, allLevelsState[level + 1] - ceilingOffset, level)
  }


  const planView = () => {
    viewer.context.ifcCamera.toggleProjection()
    viewer.plans.moveCameraTo2DPlanPosition(true)
    const yConst = 100 // value used in moveCameraTo2DPlanPosition in web-ifc
    const center = model.geometry.boundingBox.getCenter()
    const camera = viewer.context.ifcCamera
    camera.cameraControls.setLookAt(center.x, yConst, center.z, center.x, 0, center.z, true)
    const currentProjection = camera.projectionManager.currentProjection
    const camFac = 5
    if (currentProjection === 0) {
      camera.cameraControls.setLookAt(
          center.x * camFac, center.y * camFac, -center.z * camFac, center.x, center.y, center.z, true)
    }
  }


  const handleClick = (event) => {
    setAnchorEl(event.currentTarget)
  }


  const handleClose = () => {
    setAnchorEl(null)
  }


  return (
    <>
      <TooltipIconButton
        title={'Isolate Levels'}
        icon={<LevelsIcon/>}
        onClick={handleClick}
        selected={anchorEl !== null || levelInstance !== null}
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
              color: theme.palette.secondary.main,
              fontWeight: 600,
            },
          },
        }}
      >
        <TooltipIconButton
          title={'Toggle Plan View'}
          icon={<PlanViewIcon/>}
          onClick={planView}
        />
        {allLevelsState && allLevelsState.map((level, i) => (
          <MenuItem
            key={i}
            onClick={() => isolateFloor(i)}
            selected={levelInstance === (allLevelsState[i] + floorOffset)}
          >
            L{i}
          </MenuItem>))
        }
      </Menu>
    </>
  )
}


/**
 * Extract related elements.
 *
 * @param {object} ifcModel
 * @return {Array<number>} elevation values
 */
async function extractHeight(ifcModel) {
  const storeys = await ifcModel.getAllItemsOfType(IFCBUILDINGSTOREY, true)
  const elevValues = []
  for (let i = 0; i < storeys.length; i++) {
    elevValues[i] = storeys[i].Elevation.value
  }
  return elevValues
}
