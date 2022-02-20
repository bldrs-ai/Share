import React from 'react'
import IconButton from '@mui/material/IconButton'
import {makeStyles} from '@mui/styles'
import Settings from './Settings'
import AboutControl from './AboutPanel'
import Open from '../assets/2D/Open.svg'


/**
 * @param {Function} fileOpen
 * @param {Number} offsetTop
 * @return {Object} React component.
 */
export default function InfoGroup({fileOpen, offsetTop}) {
  const classes = useStyles()
  return (
    <div className = {classes.container}>
      <AboutControl offsetTop = {offsetTop}/>
      <IconButton
        aria-label='account of current user'
        aria-controls='menu-appbar'
        aria-haspopup='true'
        onClick={fileOpen}
        color='inherit'
      >
        <Open className = {classes.icon}/>
      </IconButton>
      <Settings />
    </div>
  )
}

const useStyles = makeStyles({
  icon: {
    width: '30px',
    height: '30px',
  },
  container: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '140px',
    alignItems: 'center',
  },
})
