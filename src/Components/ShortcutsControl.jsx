import React, {useState} from 'react'
import Typography from '@mui/material/Typography'
import {makeStyles} from '@mui/styles'
import Dialog from './Dialog'
import {useIsMobile} from './Hooks'
import {ControlButton} from './Buttons'
import KnowledgeIcon from '../assets/2D_Icons/Knowledge.svg'


/**
 * Displays keyboard shortcuts like how to add a cut plane.
 *
 * @return {object} React component
 */
export default function ShortcutsControl() {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
  const classes = useStyles()
  return (
    <ControlButton
      title='Guides'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      icon={<div className={classes.iconContainer}><KnowledgeIcon/></div>}
      dialog={
        <ShortcutsDialog
          isDialogDisplayed={isDialogDisplayed}
          setIsDialogDisplayed={setIsDialogDisplayed}
        />}
    />)
}


/**
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @return {object} React component
 */
function ShortcutsDialog({isDialogDisplayed, setIsDialogDisplayed}) {
  const classes = useStyles()
  const isMobile = useIsMobile()
  return (
    <Dialog
      icon={<KnowledgeIcon/>}
      headerText='Guides'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      content={
        isMobile ?
          (
            <div>
              <Typography variant='h2'>Guide</Typography>
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
            </div>
          ) :
          (
            <ul className={classes.content}>
              <p>To attach a section plane:</p>
              <li>Hover over an element</li>
              <li>Press <strong>Q to attach a section plane</strong></li>
              <li>Hover over a plane press <strong>W to delete the plane</strong></li>
              <li>Multiple planes can be attached to a model</li>
              <p>To clear selection:</p>
              <li>Press <strong>A to clear selected element</strong></li>
            </ul>
          )
      }
    />
  )
}


const useStyles = makeStyles({
  content: {
    textAlign: 'left',
  },
  iconContainer: {
    width: '20px',
    height: '20px',
    marginBottom: '4px',
  },
})
