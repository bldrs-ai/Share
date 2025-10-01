import React, {ReactElement} from 'react'
import Link from '@mui/material/Link'
import {NotFoundError} from '../loader/Loader'
import useStore from '../store/useStore'
import Dialog from './Dialog'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import {trackAlert} from '../utils/alertTracking'


/**
 * Alert Dialog is presented when a model cannot be loaded
 *
 * @property {Function} onClose trigger close of the dialog
 * @return {ReactElement}
 */
export default function AlertDialog({onClose}) {
  const alert = useStore((state) => state.alert)
  const setAlert = useStore((state) => state.setAlert)

  const onCloseInner = () => {
    setAlert(null)
    onClose()
  }

  const isOom = alert && typeof alert === 'object' && alert.type === 'oom'
  const refresh = () => {
    try {
 window.location.reload()
} catch (_) {/* noop */}
  }
  const actionCb = isOom ? refresh : onCloseInner
  const actionTitle = isOom ? 'Refresh' : 'Reset'
  return (
    <Dialog
      headerText={isOom ? 'Out of Memory' : 'Error'}
      isDialogDisplayed={alert !== null}
      setIsDialogDisplayed={onCloseInner}
      actionCb={actionCb}
      headerIcon={<ErrorOutlineIcon className='icon-share'/>}
      actionTitle={actionTitle}
    >
      <p>
        {createAlertReport(alert)}<br/>
        {!isOom && (
          <>For more help contact us on our{' '}
            <Link href='https://discord.gg/9SxguBkFfQ' target='_blank' rel='noopener noreferrer'>
              Discord
            </Link>{' '}
            for help
          </>
        )}
      </p>
    </Dialog>
  )
}


/**
 * @param {object} a
 * @return {ReactElement}
 */
function createAlertReport(a) {
  if (a === null) {
    return ''
  }
  if (typeof a === 'string') {
    trackAlert(a)
    return a
  } else if (typeof a === 'object') {
    if (a && a.type === 'oom') {
      trackAlert(a.message, a)
      return a.message
    } else if (a instanceof NotFoundError) {
      trackAlert(a.message, a)
      return displayPathAlert(a)
    } else if (a instanceof Error) {
      console.error('General error:', a)
      trackAlert(a.message, a)
      return `${a}`
    }
  }
  return ''
}


/**
 * @param {object} alert
 * @return {ReactElement}
 */
function displayPathAlert(alert) {
  return (
    <p>
      Check the file path:<br/>
      {alert && insertZeroWidthSpaces(alert)}
    </p>
  )
}


/**
 * Insert the spaces after / _ character to make sure the string breaks correctly
 *
 * @property {string} str error path, usually a long string
 * @return {string} formatted string
 */
const insertZeroWidthSpaces = (str) => {
  return str.replace(/([/_-])/g, '$1\u200B')
}
