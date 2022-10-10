import React, {useState, useEffect} from 'react'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import {TooltipIconButton} from './Buttons'
import useStore from '../store/useStore'
import useTheme from '../Theme'
import {addHashParams, getHashParams, removeHashParams} from '../utils/location'
import {getModelCenter} from '../utils/cutPlane'
import {Vector3} from 'three'
import {removePlanes} from '../utils/cutPlane'
import {extractHeight} from '../utils/extractHeight'
import LevelsIcon from '../assets/2D_Icons/Levels.svg'
import PlanViewIcon from '../assets/2D_Icons/PlanView.svg'

/**
 * BasicMenu used when there are several option behind UI button
 * show/hide from the right of the screen.
 *
 * @param {Array} listOfOptions Title for the drawer
 * @return {object} ItemPropertiesDrawer react component
 */
export default function ExtractLevelsMenu({listOfOptions, icon, title}) {
  const [anchorEl, setAnchorEl] = useState(null)
  const theme = useTheme()
  const open = Boolean(anchorEl)

  const model = useStore((state) => state.modelStore)
  const [allStoreys, setAllStor] = useState([])

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget)
  }
  const handleClose = () => {
    setAnchorEl(null)
  }
  const viewer = useStore((state) => state.viewerStore)
  const levelInstance = useStore((state) => state.levelInstance)
  const setLevelInstance = useStore((state) => state.setLevelInstance)

  const LEVEL_PREFIX = 'l'

  const createFloorplanPlane = (planeHeightBottom, planeHeightTop, level) => {
    removePlanes(viewer)
    const levelHash = getHashParams(location, 'l')
    const modelCenter1 = new Vector3(0, planeHeightBottom, 0)
    const modelCenter2 = new Vector3(0, planeHeightTop, 0)
    const normal1 = new Vector3(0, 1, 0)
    const normal2 = new Vector3(0, -1, 0)
    viewer.clipper.createFromNormalAndCoplanarPoint(normal1, modelCenter1)
    viewer.clipper.createFromNormalAndCoplanarPoint(normal2, modelCenter2)
    if (planeHeightBottom === levelInstance) {
      removePlanes(viewer)
      removeHashParams(window.location, LEVEL_PREFIX)
      setLevelInstance(null)
      return
    }
    if (!levelHash || levelHash !== level ) {
      addHashParams(window.location, LEVEL_PREFIX, {levelSelected: level})
    }
    setLevelInstance(planeHeightBottom)
  }
  const planView = () => {
    viewer.context.ifcCamera.toggleProjection()
    viewer.plans.moveCameraTo2DPlanPosition(true)
    const yConst = 100 // value used in moveCameraTo2DPlanPosition in web-ifc
    const modelCenterX = getModelCenter(model).x
    const modelCenterY = getModelCenter(model).y
    const modelCenterZ = getModelCenter(model).z
    const camera = viewer.context.ifcCamera
    camera.cameraControls.setLookAt(modelCenterX, yConst, modelCenterZ, modelCenterX, 0, modelCenterZ, true)
    const currentProjection = camera.projectionManager.currentProjection
    const camFac = 5
    if (currentProjection === 0) {
      camera.cameraControls.setLookAt(
          modelCenterX * camFac, modelCenterY * camFac, -modelCenterZ * camFac, modelCenterX, modelCenterY, modelCenterZ, true)
    }
  }

  useEffect(() => {
    fetchStorey()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])


  const fetchStorey = async () => {
    const allStorey = await extractHeight(model)
    setAllStor(allStorey)
    extractLevelFromHash(allStorey)
  }

  const extractLevelFromHash = (allStoreyHash) => {
    const levelHash = getHashParams(location, 'l')
    if (levelHash && model && viewer && allStoreyHash) {
      console.log(allStoreyHash)
      const level = parseInt(levelHash.split(':')[1])
      createFloorplanPlane(allStoreyHash[level] + floorOffset, allStoreyHash[level + 1] - ceilingOffset, level)
    }
  }

  const floorOffset = 0.2
  const ceilingOffset = 0.4

  return (
    <div>
      <TooltipIconButton
        title={'Isolate Levels'}
        icon={<LevelsIcon/>}
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
        <TooltipIconButton
          title={'Toggle Plan View'}
          icon={<PlanViewIcon/>}
          onClick={planView}
        />
        {allStoreys && allStoreys.map((storey, i) => (
          <MenuItem
            key={i}
            onClick={() =>
              createFloorplanPlane(allStoreys[i] + floorOffset, allStoreys[i + 1] - ceilingOffset, i)}
            selected={levelInstance === (allStoreys[i] + floorOffset)}
          >  L{i}
          </MenuItem>))
        }
      </Menu>
    </div>
  )
}

