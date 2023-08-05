import React from 'react'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'
import MuiDialog from '@mui/material/Dialog'
import {RectangularButton, CloseButton} from '../Buttons'
import Tabs from './Tabs'
import TabsSimple from './TabsSimple'
import {assertDefined} from '../../utils/assert'


/**
 * A generic base dialog component.
 *
 * @property {object} icon Leading icon above header description
 * @property {string} headerText Short message describing the operation
 * @property {boolean} isDialogDisplayed React var
 * @property {Function} setIsDialogDisplayed React setter
 * @property {React.ReactElement} content Content of the dialog
 * @property {string} actionTitle Title for the action button
 * @property {Function} actionCb Callback for action button
 * @property {React.ReactElement} [actionIcon] Optional icon for the action button
 * @property {Array<object>} tabList Array of tabs name and tab content
 * @return {React.Component}
 */
export default function Dialog({
  icon,
  headerText,
  isDialogDisplayed,
  setIsDialogDisplayed,
  actionTitle,
  actionCb,
  actionIcon,
  tabList,
}) {
  assertDefined(
      icon, headerText, isDialogDisplayed, setIsDialogDisplayed,
      actionTitle, actionCb, tabList)
  const close = () => setIsDialogDisplayed(false)
  return (
    <MuiDialog
      open={isDialogDisplayed}
      onClose={close}
      PaperProps={{variant: 'control'}}
    >
      <CloseButton onClick={close}/>
      <DialogTitle >
        {icon}<br/>
        <Typography variant={'h4'}>{headerText}</Typography>
      </DialogTitle>
      <DialogContent sx={{border: '1px solid lightGray', padding: '10px'}}>
        <TabsSimple tabList={['Explore', 'Open', 'Save']}/>
      </DialogContent>
      <DialogContent sx={{border: '1px solid lightGray', padding: '0px'}}>
        <Tabs tabList={tabList}/>
      </DialogContent>
      <DialogActions sx={{border: '1px solid lightGray'}} disableSpacing>
        <RectangularButton title={actionTitle} icon={actionIcon} onClick={actionCb}/>
      </DialogActions>
    </MuiDialog>
  )
}
