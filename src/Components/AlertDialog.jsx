import React, {ReactElement} from 'react'
import {Link} from '@mui/material'
import {ErrorOutline as ErrorOutlineIcon} from '@mui/icons-material'
import {NotFoundError} from '../loader/Loader'
import {getProvider} from '../connections/registry'
import useStore from '../store/useStore'
import {trackAlert} from '../utils/alertTracking'
import Dialog from './Dialog'


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
  const isNeedsReconnect = alert && typeof alert === 'object' && alert.type === 'needsReconnect'

  const refresh = () => {
    try {
      window.location.reload()
    } catch (_) {/* noop */}
  }

  // Reconnect the connection from inside this user-gesture click. The button
  // press supplies the activation that GIS needs to legally pop a consent
  // window; on success the token cache is refreshed and we reload so the
  // page's pending Drive load picks up the new token. If the user cancels or
  // the popup is blocked again, leave the dialog up so they can try again.
  const reconnect = async () => {
    if (!isNeedsReconnect) {
      return
    }
    const provider = getProvider(alert.connection.providerId)
    if (!provider) {
      return
    }
    try {
      await provider.getAccessToken(alert.connection)
      setAlert(null)
      refresh()
    } catch (_) {
      // Stay on the dialog; user can retry.
    }
  }

  let actionCb
  let actionTitle
  if (isOom) {
    actionCb = refresh
    actionTitle = 'Refresh'
  } else if (isNeedsReconnect) {
    actionCb = reconnect
    actionTitle = 'Reconnect'
  } else {
    actionCb = onCloseInner
    actionTitle = 'Reset'
  }

  let headerText
  if (isOom) {
    headerText = 'Out of Memory'
  } else if (isNeedsReconnect) {
    headerText = 'Reconnect required'
  } else {
    headerText = 'Error'
  }

  const showHelpFooter = !isOom && !isNeedsReconnect
  return (
    <Dialog
      headerText={headerText}
      isDialogDisplayed={alert !== null}
      setIsDialogDisplayed={onCloseInner}
      actionCb={actionCb}
      headerIcon={<ErrorOutlineIcon className='icon-share'/>}
      actionTitle={actionTitle}
    >
      <p>
        {createAlertReport(alert)}<br/>
        {showHelpFooter && (
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
    } else if (a && a.type === 'needsReconnect') {
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
 * @param {string} str error path, usually a long string
 * @return {string} formatted string
 */
const insertZeroWidthSpaces = (str) => {
  return str.replace(/([/_-])/g, '$1\u200B')
}
