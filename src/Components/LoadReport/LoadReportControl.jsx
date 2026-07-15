import React, {ReactElement, useState} from 'react'
import {Box, Snackbar} from '@mui/material'
import {InfoOutlined as InfoOutlinedIcon} from '@mui/icons-material'
import useStore from '../../store/useStore'
import {TooltipIconButton} from '../Buttons'
import Dialog from '../Dialog'


const COPY_CONFIRM_MS = 2000


/**
 * Post-load "i" control (conway #301 follow-up): sits next to the "?"
 * Help control once a load has finished and opens the accumulated
 * load-log report (design/new/load-log-format.md) in a dialog the user
 * can copy — the same lines the JS console received during the load.
 * Hidden while a load is running (LoadStatusSlot owns that) and before
 * any load has produced a report.
 *
 * @return {ReactElement|null}
 */
export default function LoadReportControl() {
  const loadReportLines = useStore((state) => state.loadReportLines)
  const currentLoadLine = useStore((state) => state.currentLoadLine)
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
  const [isCopyConfirmVisible, setIsCopyConfirmVisible] = useState(false)

  const isLoadRunning = currentLoadLine !== null
  if (isLoadRunning || loadReportLines.length === 0) {
    return null
  }

  const reportText = loadReportLines.join('\n')

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(reportText)
      setIsCopyConfirmVisible(true)
    } catch {
      // Clipboard unavailable (permissions/insecure context) — the user can
      // still select the <pre> text manually.
    }
  }

  return (
    <>
      <TooltipIconButton
        title='Load report'
        onClick={() => setIsDialogDisplayed(true)}
        icon={<InfoOutlinedIcon className='icon-share'/>}
        selected={isDialogDisplayed}
        variant='control'
        placement='top'
        dataTestId='control-button-load-report'
      />
      <Dialog
        headerIcon={<InfoOutlinedIcon className='icon-share'/>}
        headerText='Load report'
        isDialogDisplayed={isDialogDisplayed}
        setIsDialogDisplayed={setIsDialogDisplayed}
        actionTitle='Copy to clipboard'
        actionCb={onCopy}
      >
        <Box
          component='pre'
          data-testid='LoadReportText'
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            textAlign: 'left',
            overflowX: 'auto',
            userSelect: 'text',
            m: 0,
          }}
        >
          {reportText}
        </Box>
      </Dialog>
      <Snackbar
        open={isCopyConfirmVisible}
        autoHideDuration={COPY_CONFIRM_MS}
        onClose={() => setIsCopyConfirmVisible(false)}
        message='Load report copied'
      />
    </>
  )
}
