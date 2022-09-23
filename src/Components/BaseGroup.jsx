import React from 'react'
import {makeStyles} from '@mui/styles'
import OpenModelControl from './OpenModelControl'


/**
 * Base group contains Settings, ModelUpload, About
 *
 * @param {string} installPrefix Serving prefix for the app, for use in
 * constructing static asset links.
 * @param {object} fileOpen ItemPanel component
 * @return {object} React component
 */
export default function BaseGroup({installPrefix, fileOpen}) {
  const classes = useStyles()
  return (
    <div className={classes.root}>
      <OpenModelControl installPrefix={installPrefix} fileOpen={fileOpen}/>
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
