import React from 'react'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import {makeStyles} from '@mui/styles'
import Settings from './Settings'
import AboutControl from './AboutPanel'
import Open from '../assets/3D/Open.svg'


/**
 * Base group contains Settings, ModelUpload, About
 * @param {function} fileOpen opens a file dialog for new model upload
 * @param {Number} offsetTop
 * @return {Object} React component.
 */
export default function BaseGroup({fileOpen, offsetTop}) {
  const classes = useStyles()
  return (
    <div className = {classes.container}>
      <AboutControl offsetTop = {offsetTop}/>
      <Tooltip title="Upload Model" placement="top">
        <IconButton
          aria-label='account of current user'
          aria-controls='menu-appbar'
          aria-haspopup='true'
          onClick={fileOpen}
          color='inherit'
        >
          <Open className = {classes.icon}/>
        </IconButton>
      </Tooltip>
      <Settings />
    </div>
  )
}


const useStyles = makeStyles({
  icon: {
    'width': '30px',
    'height': '30px',
  },
  container: {
    'display': 'flex',
    'flexDirection': 'row',
    'justifyContent': 'space-between',
    'width': '140px',
    'alignItems': 'center',
  },
})
