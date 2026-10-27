import React, {ReactElement, useEffect, useRef} from 'react'
import {Link} from '@mui/material'
import {ErrorOutline as ErrorOutlineIcon} from '@mui/icons-material'
import {ENGINE_FAILURE_ALERT_EVENT} from '../loader/engineOpenFailure'
import {NotFoundError} from '../loader/Loader'
import {getProvider} from '../connections/registry'
import useStore from '../store/useStore'
import {trackAlert, trackAlertEvent} from '../utils/alertTracking'
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

  // Sentry + GA tracking must NOT run from inside the render (it used to
  // sit inside `createAlertReport`, called from JSX, so a load failure
  // produced one Sentry event per re-render of the dialog — Sentry's
  // SHARE-N5 had ~2.7× SHARE-RS's events for exactly this reason). Drive
  // it from an effect keyed on the alert value so it fires once per
  // distinct alert. `console.error` for generic errors lives here too —
  // logging from render would multiply the same way.
  //
  // The ref-gated dedup below covers React StrictMode's intentional
  // double-invocation of effects in dev — without it a dev session
  // would double-count every alert in Sentry + GA. Production isn't
  // affected (StrictMode is a no-op there) but the guard is cheap.
  const lastTrackedAlertRef = useRef(null)
  useEffect(() => {
    if (alert === lastTrackedAlertRef.current) {
      return
    }
    lastTrackedAlertRef.current = alert
    if (alert === null) {
      return
    }
    if (typeof alert === 'string') {
      trackAlert(alert)
      return
    }
    if (typeof alert !== 'object') {
      return
    }
    if (alert.type === 'engineFailure') {
      // A constant, not alert.message: the message carries conway's free-form
      // reason (file-derived text, unbounded cardinality), which must not
      // reach GA. CadView already captured the failure in Sentry with the
      // reason as tags/context, so a second capture of this plain alert
      // object would be a context-less duplicate; and load_failed carries
      // the closed-set reason_class.
      trackAlertEvent(ENGINE_FAILURE_ALERT_EVENT)
    } else if (alert.type === 'unsupportedSchema' || alert.type === 'inMemoryUploadGone' ||
        alert.type === 'uploadNotInBrowser') {
      // Expected outcome, not a defect: analytics only, never Sentry
      // (alertTracking.js#trackAlertEvent). `inMemoryUploadGone` is a
      // /v/local-only/ URL whose file, opened without OPFS, was held only by a
      // page that is gone (OPFS/messages.js, #1906); `uploadNotInBrowser` is
      // a /v/local-only/ link, with OPFS available, to an upload this browser
      // doesn't hold (#1955).
      trackAlertEvent(alert.message)
    } else if (alert.type === 'oom' || alert.type === 'needsReconnect') {
      trackAlert(alert.message, alert)
    } else if (alert instanceof NotFoundError || alert instanceof Error) {
      if (!(alert instanceof NotFoundError)) {
        console.error('General error:', alert)
      }
      trackAlert(alert.message, alert)
    }
  }, [alert])

  const onCloseInner = () => {
    setAlert(null)
    onClose()
  }

  const isOom = alert && typeof alert === 'object' && alert.type === 'oom'
  const isNeedsReconnect = alert && typeof alert === 'object' && alert.type === 'needsReconnect'
  const isUnsupportedSchema = alert && typeof alert === 'object' && alert.type === 'unsupportedSchema'
  const isInMemoryUploadGone = alert && typeof alert === 'object' && alert.type === 'inMemoryUploadGone'
  const isUploadNotInBrowser = alert && typeof alert === 'object' && alert.type === 'uploadNotInBrowser'
  const setIsOpenModelVisible = useStore((state) => state.setIsOpenModelVisible)

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

  // The upload is gone, so there is no model to stay on: close the way a
  // failed load does (onClose → navToDefault), then open the Open dialog so
  // re-opening the file is one click. Visibility is store state that
  // useHashState re-asserts as `#open` after the navigation, so it survives
  // the route change.
  const openAFile = () => {
    onCloseInner()
    setIsOpenModelVisible(true)
  }

  let actionCb
  let actionTitle
  if (isOom) {
    actionCb = refresh
    actionTitle = 'Refresh'
  } else if (isNeedsReconnect) {
    actionCb = reconnect
    actionTitle = 'Reconnect'
  } else if (isInMemoryUploadGone) {
    // Nothing loaded, so close the way a failed load does (onClose →
    // navToDefault); "Reset" would suggest something can be fixed here.
    actionCb = onCloseInner
    actionTitle = 'OK'
  } else if (isUploadNotInBrowser) {
    actionCb = openAFile
    actionTitle = 'Open a file'
  } else {
    actionCb = onCloseInner
    actionTitle = 'Reset'
  }

  let headerText
  if (isOom) {
    headerText = 'Out of Memory'
  } else if (isNeedsReconnect) {
    headerText = 'Reconnect required'
  } else if (isUnsupportedSchema) {
    headerText = 'Not supported yet'
  } else if (isInMemoryUploadGone) {
    headerText = 'File no longer available'
  } else if (isUploadNotInBrowser) {
    headerText = 'File not in this browser'
  } else {
    headerText = 'Error'
  }

  // No "contact us" footer for an unsupported schema, an in-memory upload
  // whose page is gone, or an upload this browser doesn't hold: all are
  // known, documented limits, so there is nothing for support to diagnose.
  const showHelpFooter = !isOom && !isNeedsReconnect && !isUnsupportedSchema && !isInMemoryUploadGone &&
    !isUploadNotInBrowser
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
 * Pure formatter for the alert display. Side effects (Sentry capture,
 * GA tracking, console.error) live in the AlertDialog useEffect above —
 * calling them from here would re-fire on every render.
 *
 * @param {object} a
 * @return {ReactElement|string}
 */
function createAlertReport(a) {
  if (a === null) {
    return ''
  }
  if (typeof a === 'string') {
    return a
  } else if (typeof a === 'object') {
    if (a && (a.type === 'oom' || a.type === 'needsReconnect' || a.type === 'unsupportedSchema' ||
        a.type === 'inMemoryUploadGone' || a.type === 'uploadNotInBrowser' || a.type === 'engineFailure')) {
      return a.message
    } else if (a instanceof NotFoundError) {
      return displayPathAlert(a)
    } else if (a instanceof Error) {
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
