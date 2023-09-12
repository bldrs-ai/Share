import React, {useState} from 'react'
import MuiDialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import {assertDefined, assertArraysEqualLength} from '../utils/assert'
import {CloseButton, RectangularButton} from './Buttons'
import Tabs from './Tabs'


/**
 * A Dialog with tabs to page between associated contents.
 *
 * @property {Array<string>} tabLabels Tab names
 * @property {Array<string>} headerLabels Short messages describing the current operation
 * @property {Array<React.Element>} contentComponents Components coresponding to the tabs
 * @property {Array<React.Element>} actionCbs Callbacks for each component's ok button
 * @property {boolean} isDialogDisplayed React var
 * @property {Function} setIsDialogDisplayed React setter
 * @property {boolean} [isTabsScrollable] Activate if the number of tabs is larger than 5
 * @property {React.ReactElement} [icon] Leading icon above header description
 * @property {string} [actionButtonLabels] Labels for action ok buttons
 * @return {React.Component}
 */
export default function TabbedDialog({
  tabLabels,
  headerLabels,
  contentComponents,
  actionCbs,
  isDialogDisplayed,
  setIsDialogDisplayed,
  isTabsScrollable = false,
  icon,
  actionButtonLabels,
}) {
  assertDefined(tabLabels, headerLabels, contentComponents, actionCbs, isDialogDisplayed, setIsDialogDisplayed)
  assertArraysEqualLength(tabLabels, headerLabels, contentComponents, actionCbs)
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
        {headerLabels[currentTab]}
      </DialogTitle>
      <DialogContent>
        <Tabs tabLabels={tabLabels} actionCb={setCurrentTab} isScrollable={isTabsScrollable}/>
      </DialogContent>
      <DialogContent>
        {contentComponents[currentTab]}
      </DialogContent>
      <DialogActions>
        <RectangularButton
          title={actionButtonLabels ? actionButtonLabels[currentTab] : 'Ok'}
          onClick={actionCbs[currentTab]}
        />
      </DialogActions>
    </MuiDialog>
  )
}
