import React, {useState} from 'react'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'
import MuiDialog from '@mui/material/Dialog'
import Tabs from './Tabs'
import {RectangularButton, CloseButton} from '../Buttons'
import {assertDefined} from '../../utils/assert'


/**
 * A generic base dialog component.
 *
 * @property {React.ReactElement} icon Leading icon above header description
 * @property {Array<string>} headerText Short array of messages describing the current opeation
 * @property {Array<string>} tabList Array of tabs name and tab content
 * @property {Array<React.ReactElement>} contentList Array of components coresponding to the tabs
 * @property {boolean} isDialogDisplayed React var
 * @property {Function} setIsDialogDisplayed React setter
 * @property {string} actionTitle Title for the action button
 * @property {Function} actionCb Callback for action button
 * @property {React.ReactElement} [actionIcon] Optional icon for the action button
 * @return {React.Component}
 */
export default function Dialog({
  icon,
  headerTextList = ['loading'],
  tabList = ['loading'],
  contentList = ['loading'],
  isDialogDisplayed,
  setIsDialogDisplayed,
  actionTitle,
  actionCb,
  actionIcon,
}) {
  assertDefined(
      icon, headerTextList, isDialogDisplayed, setIsDialogDisplayed,
      actionTitle, actionCb, tabList)
  const close = () => setIsDialogDisplayed(false)
  const [currentTab, setCurrentTab] = useState(0)
  return (
    <MuiDialog
      maxWidth={'xs'}
      open={isDialogDisplayed}
      onClose={close}
      PaperProps={{variant: 'control'}}
    >
      <CloseButton onClick={close}/>
      <DialogTitle >
        {icon}<br/>
        <Typography variant={'h4'}>{headerTextList[currentTab]}</Typography>
      </DialogTitle>
      <DialogContent sx={{height: '70px'}}>
        <Tabs tabList={tabList} actionCb={setCurrentTab}/>
      </DialogContent>
      <DialogContent >
        {contentList[currentTab] || 'loading' }
      </DialogContent>
      <DialogActions disableSpacing>
        <RectangularButton title={actionTitle} icon={actionIcon} onClick={actionCb}/>
      </DialogActions>
    </MuiDialog>
  )
}
