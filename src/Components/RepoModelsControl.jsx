import React, {useState} from 'react'
import {makeStyles} from '@mui/styles'
import Dialog from './Dialog'
import Input from './Input'
import DropDown from './DropDown'
import ModelIcon from '../assets/2D_Icons/Model.svg'
import {ControlButton} from './Buttons'


/**
 * Displays open warning.
 * @return {Object} React component
 */
export default function RepoModelsControl({fileOpen}) {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
  return (
    <ControlButton
      placement='top'
      title='Models'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      icon={<ModelIcon/>}
      dialog={
        <RepoModelsControlDialog
          fileOpen={fileOpen}
          isDialogDisplayed={isDialogDisplayed}
          setIsDialogDisplayed={setIsDialogDisplayed}/>}/>)
}


/**
 * @param {boolean} isDialogDisplayed
 * @param {function} setIsDialogDisplayed
 * @return {Object} React component
 */
function RepoModelsControlDialog({isDialogDisplayed, setIsDialogDisplayed, fileOpen}) {
  const classes = useStyles()
  return (
    <Dialog
      icon={<ModelIcon/>}
      headerText='GitHub Repository Models'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      content={
        <div className={classes.content}>
          <div >
            <div style = {{marginBottom: '10px'}}>
              Authenticated users can connect GitHub repo to BLDRS
            </div>
            <Input placeholderText = {'repo url'} inputWidth = {'260px'} tooltipText = 'Connect' />
          </div>
          <div >
            <DropDown/>
          </div>
        </div>

      }/>
  )
}


const useStyles = makeStyles({
  content: {
    width: '260px',
    height: '200px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
})
