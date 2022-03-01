import React from 'react'
import {makeStyles} from '@mui/styles'
import AboutControl from './AboutDialog'
import Settings from './Settings'
import {TooltipIconButton} from './Buttons'
import OpenIcon from '../assets/2D_Icons/Open.svg'


/**
 * Base group contains Settings, ModelUpload, About
 * @param {Object} itemPanel ItemPanel component
 * @return {Object} React component
 */
export default function BaseGroup({fileOpen}) {
  const classes = useStyles()
  return (
    <div className={classes.root}>
      <AboutControl/>
      <TooltipIconButton title="Upload model" onClick={fileOpen} icon={<OpenIcon/>}/>
      <Settings/>
    </div>
  )
}


const useStyles = makeStyles({
  root: {
    position: 'absolute',
    width: '140px',
    bottom: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginRight: '3px',
  },
})
