import React, {useState} from 'react'
import {makeStyles} from '@mui/styles'
import Dialog from './Dialog'
import OpenIcon from '../assets/2D_Icons/Open.svg'
import LocalFileOpen from '../assets/2D_Icons/LocalFileOpen.svg'
import {ControlButton} from './Buttons'


/**
 * Displays open warning.
 * @return {Object} React component
 */
export default function OpenModelControl({fileOpen}) {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
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
      icon={<OpenIcon/>}
      headerText='Model Access'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      content={
        <div className={classes.content}>
          <LocalFileOpen/>
          <p className={classes.bullet}>
            To take advantage of all features of BLDRS, we recommend using GitHub for model hosting.
            <br/>
            <b>To access models hosted on GitHub, paste the model link into the search bar.</b>
            <br/>
            For more info visit our &nbsp;
            <a
              className = {classes.link}
              target="_blank"
              href = 'https://github.com/bldrs-ai/Share/wiki/Open-IFC-model-hosted-on-GitHub'
              rel="noreferrer">wiki</a>
            <br/>

          </p>
          <LocalFileOpen/>
          <p className={classes.bullet}>
            <b>Models accessed from local drive cannot be saved or shared.</b>
            <br/>
            <span
              className = {classes.link}
              role = 'button'
              tabIndex={0}
              onKeyPress = {()=>{
                fileOpen()
                setIsDialogDisplayed(false)
              }}
              onClick = {()=>{
                fileOpen()
                setIsDialogDisplayed(false)
              }}> open</span>
          </p>
        </div>
      }/>
  )
}


const useStyles = makeStyles({
  content: {
    width: '270px',
  },
  bullet: {
    textAlign: 'left',
  },
  link: {
    color: 'blue',
    borderBottom: '1px solid blue',
    cursor: 'pointer',
  },
  openIcon: {
    textAlign: 'center',
  },
})
