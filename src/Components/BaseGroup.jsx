import React from 'react'
import {makeStyles} from '@mui/styles'
import AboutControl from './AboutControl'
import {TooltipToggleButton} from './Buttons'
import OpenIcon from '../assets/2D_Icons/Open.svg'


/**
 * Base group contains Settings, ModelUpload, About
 * @param {string} installPrefix Serving prefix for the app, for use in
 * constructing static asset links.
 * @param {Object} fileOpen ItemPanel component
 * @return {Object} React component
 */
export default function BaseGroup({installPrefix, fileOpen}) {
  const classes = useStyles()
  return (
    <div className={classes.root}>
      <TooltipToggleButton
        title='Upload model'
        icon={<OpenIcon/>}
        onClick={fileOpen}
        placement='top'/>
      <AboutControl installPrefix={installPrefix}/>
    </div>
  )
}


const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})
