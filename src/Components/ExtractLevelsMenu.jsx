
import React, {useState, useEffect} from 'react'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import {makeStyles} from '@mui/styles'
import {TooltipIconButton} from './Buttons'
import useStore from '../store/useStore'
import {getModelCenter} from '../utils/cutPlane'
import {addHashParams, getHashParams} from '../utils/location'
import {Vector3} from 'three'
import {useLocation} from 'react-router-dom'
import {removePlanes} from '../utils/cutPlane'
import LevelsIcon from '../assets/2D_Icons/Levels.svg'
import {extractHeight} from '../utils/extractHeight'

/**
 * BasicMenu used when there are several option behind UI button
 * show/hide from the right of the screen.
 *
 * @param {Array} listOfOptions Title for the drawer
 * @return {object} ItemPropertiesDrawer react component
 */
export default function ExtractLevelsMenu({listOfOptions, icon, title}) {
  const [anchorEl, setAnchorEl] = useState(null)
  const classes = useStyles()
  const open = Boolean(anchorEl)
  const model = useStore((state) => state.modelStore)

  const PLANE_PREFIX = 'p'
  const handleClick = (event) => {
    setAnchorEl(event.currentTarget)
  }
  const handleClose = () => {
    setAnchorEl(null)
  }
  const viewer = useStore((state) => state.viewerStore)
  const location = useLocation()
  const farInt = 1000
  const createFloorplanPlane = (h1, h2) => {
    console.log('Got here')
    removePlanes(viewer)
    const modelCenter1 = new Vector3(farInt, h1, farInt)
    const modelCenter2 = new Vector3(farInt, h2, farInt)
    const normal1 = new Vector3(0, 1, 0)
    const normal2 = new Vector3(0, -1, 0)
    viewer.clipper.createFromNormalAndCoplanarPoint(normal1, modelCenter1)
    viewer.clipper.createFromNormalAndCoplanarPoint(normal2, modelCenter2)
  }
  const planView = () => {
    // viewer.context.ifcCamera.projectionManager.setOrthoCamera()
    viewer.context.ifcCamera.toggleProjection()
    viewer.plans.moveCameraTo2DPlanPosition(true)
  }
  const createPlane = (normalDirection) => {
    const modelCenter = getModelCenter(model)
    const planeHash = getHashParams(location, 'p')
    console.log('in the function modelCenter', modelCenter)
    let normal
    switch (normalDirection) {
      case 'x':
        normal = new Vector3(1, 0, 0)
        break
      case 'y':
        normal = new Vector3(0, 1, 0)
        break
      case 'z':
        normal = new Vector3(0, 0, 1)
        break
      default:
        normal = new Vector3(0, 1, 0)
        break
    }
    console.log('in the function normal', normal)
    if (!planeHash || planeHash !== normalDirection ) {
      addHashParams(window.location, PLANE_PREFIX, {planeAxis: normalDirection})
    }
    return viewer.clipper.createFromNormalAndCoplanarPoint(normal, modelCenter)
  }
  useEffect(() => {
    const planeHash = getHashParams(location, 'p')
    if (planeHash && model && viewer) {
      const modelCenter = getModelCenter(model)
      const planeDirection = planeHash.split(':')[1]
      let normal
      switch (planeDirection) {
        case 'x':
          normal = new Vector3(1, 0, 0)
          break
        case 'y':
          normal = new Vector3(0, 1, 0)
          break
        case 'z':
          normal = new Vector3(0, 0, 1)
          break
        default:
          normal = new Vector3(0, 1, 0)
          break
      }
      console.log(' ------------------------- ')
      console.log('the modelCenter from the useEffect', modelCenter)
      console.log('plane direction', planeDirection)
      console.log('normal', normal)
      console.log(' ------------------------- ')
      createPlane(planeDirection)
      // viewer.clipper.createFromNormalAndCoplanarPoint(normal, modelCenter)
    }
  }, [model])


  let [floorplanMenuItems, showExtractMenu] = useState([])

  showExtractMenu = async () => {
    const allStor = await extractHeight(model)
    console.log(allStor)
    let sampleHeights = []
    sampleHeights = allStor
    const sampleHeightsIndex = []
    for (let i = 0; i < sampleHeights.length; i++) {
      sampleHeightsIndex[i] = i
    }
    if (floorplanMenuItems.length !== sampleHeights.length) {
      const planeoffset = 0.5
      sampleHeightsIndex.forEach((data) => {
        floorplanMenuItems.push(
            <MenuItem onClick={() =>
              createFloorplanPlane(sampleHeights[data], sampleHeights[data + 1] - planeoffset)}
            >  L{data} </MenuItem>)
      })
    }
  }

  showExtractMenu()


  return (
    <div>
      <TooltipIconButton
        title={'Extract Levels'}
        icon={<LevelsIcon/>}
        onClick={handleClick}
      />
      <Menu
        elevation={1}
        id='basic-menu'
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{vertical: 'top', horizontal: 'center'}}
        transformOrigin={{vertical: 'top', horizontal: 'center'}}
        className={classes.root}
        PaperProps={{
          style: {
            left: '300px',
            transform: 'translateX(-40px) translateY(-40px)',
          },
        }}
      >
        <MenuItem onClick={() => planView()}> Plan View</MenuItem>
        <MenuItem onClick={() => {
          // showExtractMenu()
        }}
        >Extract Levels</MenuItem>
        {floorplanMenuItems}
      </Menu>
    </div>
  )
}


const useStyles = makeStyles({
  root: {
    '& .MuiMenu-root': {
      position: 'absolute',
      left: '-200px',
      top: '200px',
    },
  },
},
)
