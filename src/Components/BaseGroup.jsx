import React from 'react'
import {makeStyles} from '@mui/styles'
import AboutControl from './AboutControl'
import Settings from './Settings'
import {TooltipToggleButton} from './Buttons'
import OpenIcon from '../assets/2D_Icons/Open.svg'


/**
 * Base group contains Settings, ModelUpload, About
 * @param {Object} fileOpen ItemPanel component
 * @return {Object} React component
 */
export default function BaseGroup({fileOpen}) {
  const classes = useStyles()
  return (
    <div className={classes.root}>
      <AboutControl/>
      <TooltipToggleButton
        title='Upload model'
        icon={<OpenIcon/>}
        onClick={fileOpen}
        placement='top'/>
      <Settings/>
    </div>
  )
}


const useStyles = makeStyles({
  root: {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})
