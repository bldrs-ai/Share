import React, {useState} from 'react'
import {makeStyles} from '@mui/styles'
import Dialog from './Dialog'
import {useWindowDimensions} from './Hooks'
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
      icon={<QuestionIcon/>}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      dialog={<ShortcutsDialog setIsDialogDisplayed={setIsDialogDisplayed}/>}/>)
}


/**
 * @param {function} setIsDialogDisplayed
 * @return {Object} React component
 */
function ShortcutsDialog({setIsDialogDisplayed}) {
  const classes = useStyles()
  const {width} = useWindowDimensions()
  const isLandscape = width > 500
  return (
    <Dialog
      icon={<QuestionIcon/>}
      headerText='Shortcuts'
      closeFn={() =>setIsDialogDisplayed(false)}
      content={
        isLandscape ?
          (<ul className={classes.content}>
            <p>To attach a section plane:</p>
            <li>Hover over an element</li>
            <li>Press <strong>Q to attach a section plane</strong></li>
            <li>Hover over a plane press <strong>W to delete the plane</strong></li>
            <li>Multiple planes can be attached to a model</li>
            <p>To clear selection:</p>
            <li>Press <strong>A to clear selected element</strong></li>
          </ul>) :
          (<div>
            <h1>Guide</h1>
            <p>To select an element:</p>
            <ul>
              <li>Double tap an element</li>
              <li>X is used to clear the selection</li>
            </ul>

            <p>To attach a cut plane:</p>
            <ul>
              <li>Tap a model element</li>
              <li>Tap a section plane button</li>
              <li>Attach multiple planes</li>
              <li>X is used to clear the planes</li>
            </ul>
          </div>)
      }/>
  )
}


const useStyles = makeStyles({
  content: {
    textAlign: 'left',
  },
})
