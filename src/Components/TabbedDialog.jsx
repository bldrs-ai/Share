import React, {useState} from 'react'
import MuiDialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'
import {assertDefined} from '../utils/assert'
import {CloseButton} from './Buttons'
import Tabs from './Tabs'


/**
 * A Dialog with tabs to page between associated contents.
 *
 * @property {Array<string>} tabLabels Tab names
 * @property {Array<string>} headerLabels Short messages describing the current operation
 * @property {Array<React.ReactElement>} contentComponents Components coresponding to the tabs
 * @property {boolean} isDialogDisplayed React var
 * @property {Function} setIsDialogDisplayed React setter
 * @property {boolean} [isTabsScrollable] Activate if the number of tabs is larger than 5
 * @property {React.ReactElement} [icon] Leading icon above header description
 * @return {React.Component}
 */
export default function TabbedDialog({
  tabLabels,
  headerLabels,
  contentComponents,
  isDialogDisplayed,
  setIsDialogDisplayed,
  isTabsScrollable = false,
  icon,
}) {
  assertDefined(tabLabels, headerLabels, contentComponents, isDialogDisplayed, setIsDialogDisplayed)
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
      <DialogTitle>
        {icon && <>{icon}<br/></>}
        <Typography variant={'h1'}>{headerLabels[currentTab]}</Typography>
      </DialogTitle>
      <DialogContent>
        <Tabs tabLabels={tabLabels} actionCb={setCurrentTab} isScrollable={isTabsScrollable}/>
      </DialogContent>
      <DialogContent>
        {contentComponents[currentTab]}
      </DialogContent>
    </MuiDialog>
  )
}
