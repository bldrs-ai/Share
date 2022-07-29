import React, {useState} from 'react'
// import {makeStyles} from '@mui/styles'
import Dialog, {OpenDialogHeaderContent, OpenDialogBodyContent} from './Dialog_Redesign'
// import GitHubIcon from '../assets/2D_Icons/GitHub.svg'
import OpenFolder from '../assets/2D_Icons/OpenFolder.svg'
// import ModelsIcon from '../assets/2D_Icons/Model.svg'
// import LocalFileOpen from '../assets/2D_Icons/LocalFileOpen.svg'
import {ControlButton} from './Buttons'


/**
 * Displays open warning.
 * @return {Object} React component
 */
export default function OpenModelControl({fileOpen}) {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
  return (
    <ControlButton
      title='Open IFC'
      placement='top'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      icon={<OpenFolder style={{height: '50px', width: '50px'}}/>}
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
  return (
    <Dialog
      headerContent={<OpenDialogHeaderContent/>}
      bodyContent={<OpenDialogBodyContent/>}
      headerText={'Open file'}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
    />
  )
}
