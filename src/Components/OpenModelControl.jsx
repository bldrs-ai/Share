import React, {useState} from 'react'
import {makeStyles} from '@mui/styles'
import Dialog from './Dialog'
import OpenIcon from '../assets/2D_Icons/Open.svg'
import Warning from '../assets/2D_Icons/Warning.svg'
import {ControlButton} from './Buttons'


/**
 * Displays keyboard shortcuts like how to add a cut plane.
 * @return {Object} React component
 */
export default function OpenModelControl({fileOpen}) {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(true)
  return (
    <ControlButton
      title='Shortcut keys'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      icon={<OpenIcon/>}
      dialog={
        <OpenModelDialog
          fileOpen={fileOpen}
          isDialogDisplayed={isDialogDisplayed}
          setIsDialogDisplayed={setIsDialogDisplayed}/>}/>)
}


/**
 * @param {boolean} isDialogDisplayed
 * @param {function} setIsDialogDisplayed
 * @return {Object} React component
 */
function OpenModelDialog({isDialogDisplayed, setIsDialogDisplayed, fileOpen}) {
  const classes = useStyles()
  return (
    <Dialog
      icon={<Warning/>}
      headerText='Open Warning'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      content={
        <div className={classes.content}>
          <p>We encourage to use GITHUB for model hosting.</p>
          <p>We further explain the process of ifc management
            <span className = {classes.link}>here</span>
          </p>
          <p>If the model is hosted on GITHUB,
            it is accessed by pasting a GITHUB link into the search bar.</p>
          <p>When the model is opened locally there is
            no way to save the data or share the model.</p>
          <p>If you still want to open the model from the local drive. Click open icon.</p>
          <span className={classes.openIcon} role="button" tabIndex={0}
            onKeyDown={()=>{}}
            onClick = {()=>{
              fileOpen(), setIsDialogDisplayed(false)
            }}><OpenIcon/></span>
        </div>
      }/>
  )
}


const useStyles = makeStyles({
  content: {
    textAlign: 'left',
  },
  link: {
    color: 'blue',
    borderBottom: '1px solid blue',
  },
  openIcon: {
    textAlign: 'center',
  },
})
