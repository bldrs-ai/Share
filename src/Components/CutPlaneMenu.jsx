import React, {useState} from 'react'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import {makeStyles} from '@mui/styles'
import {TooltipIconButton} from './Buttons'
import CutPlaneIcon from '../assets/2D_Icons/CutPlane.svg'
import useStore from '../store/useStore'
import {getModelCenter} from '../utils/cutPlane'
import {Vector3} from 'three'

/**
 * BasicMenu used when there are several option behind UI button
 * show/hide from the right of the screen.
 * @param {Array} listOfOptions Title for the drawer
 * @return {Object} ItemPropertiesDrawer react component
 */
export default function CutPlaneMenu({listOfOptions, icon, title}) {
  const [anchorEl, setAnchorEl] = useState(null)
  const classes = useStyles()
  const open = Boolean(anchorEl)
  const model = useStore((state) => state.modelStore)
  const handleClick = (event) => {
    setAnchorEl(event.currentTarget)
  }
  const handleClose = () => {
    setAnchorEl(null)
  }
  const viewer = useStore((state) => state.viewerStore)

  const createPlane = (normalDirection) => {
    const modelCenter = getModelCenter(model)
    console.log('normal direction', normalDirection)
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
    return viewer.clipper.createFromNormalAndCoplanarPoint(normal, modelCenter)
  }

  return (
    <div>
      <TooltipIconButton
        title={'Cut Planes'}
        icon={<CutPlaneIcon/>}
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
        <MenuItem onClick={() => createPlane('x')}> X</MenuItem>
        <MenuItem onClick={() => createPlane('y')}>Y</MenuItem>
        <MenuItem onClick={() => createPlane('z')}>Z</MenuItem>
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

