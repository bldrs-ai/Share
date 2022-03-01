import React, {useState} from 'react'
import {makeStyles} from '@mui/styles'
import Dialog from './Dialog'
import QuestionIcon from '../assets/2D_Icons/Question.svg'
import {ControlButton} from './Buttons'


/**
 * Displays keyboard shortcuts like how to add a cut plane.
 * @return {Object} React component
 */
export default function ShortcutsControl() {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
  return (
    <ControlButton
      title='Shortcut keys'
      toggleValue='shortcuts'
      icon={<QuestionIcon/>}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      dialog={
        <ShortcutsDialog setIsDialogDisplayed={setIsDialogDisplayed}/>
      }
    />)
}


/**
 * @param {function} setIsDialogDisplayed
 * @return {Object} React component
 */
function ShortcutsDialog({setIsDialogDisplayed}) {
  const classes = useStyles()
  return (
    <Dialog
      icon={<QuestionIcon/>}
      headerText='Shortcuts'
      closeFn={() =>setIsDialogDisplayed(false)}
      content={
        <ul className={classes.content}>
          <p>To attach a section plane:</p>
          <li>Hover over an element</li>
          <li>Press <strong>Q to attach a section plane</strong></li>
          <li>Hover over a plane press <strong>W to delete the plane</strong></li>
          <li>Multiple planes can be attached to a model</li>
          <p>To clear selection:</p>
          <li>Press <strong>A to clear selected element</strong></li>
        </ul>
      }/>
  )
}


const useStyles = makeStyles({
  content: {
    'height': '300px',
    'fontFamily': 'Helvetica',
    'padding': '1em',
    '& ul, & li': {
      fontWeight: 200,
      textAlign: 'left',
      fontSize: 16,
    },
    '& ul p': {
      textAlign: 'left',
    },
  },
})
