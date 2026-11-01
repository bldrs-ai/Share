import React, {ReactElement, useEffect, useRef} from 'react'
import {Link} from '@mui/material'
import {ErrorOutline as ErrorOutlineIcon, InfoOutlined as InfoOutlinedIcon} from '@mui/icons-material'
import {ENGINE_FAILURE_ALERT_EVENT} from '../loader/engineOpenFailure'
import {archiveGuidance, formatGuidance} from '../loader/formatGuidance'
import {ARCHIVE_ENTRY_CHOICE, ARCHIVE_UNREADABLE} from '../loader/modelArchive'
import {NotFoundError} from '../loader/Loader'
import {UNRECOGNIZED_FORMAT_ALERT_EVENT, reportUnrecognizedFormat} from '../loader/unrecognizedFormat'
import {getProvider} from '../connections/registry'
import useStore from '../store/useStore'
import {trackAlert, trackAlertEvent} from '../utils/alertTracking'
import ArchiveEntryChoice from './ArchiveEntryChoice'
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
    if (alert.type === ARCHIVE_ENTRY_CHOICE) {
      // A question, not a failure: nothing to count. Its entry names are the
      // user's file names, which must not reach Sentry or GA anyway.
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
        alert.type === 'uploadNotInBrowser' || alert.type === 'noGeometry' || alert.type === ARCHIVE_UNREADABLE) {
      // Expected outcome, not a defect: analytics only, never Sentry
      // (alertTracking.js#trackAlertEvent). `inMemoryUploadGone` is a
      // /v/local-only/ URL whose file, opened without OPFS, was held only by a
      // page that is gone (OPFS/messages.js, #1906); `uploadNotInBrowser` is
      // a /v/local-only/ link, with OPFS available, to an upload this browser
      // doesn't hold (#1955). `noGeometry` is a model conway read fine that
      // has nothing to draw (loadProgress#classifyLoadOutcome, #1962).
      // `archiveUnreadable` is a hosted `.ifczip` that isn't one readable
      // IFC (loader/modelArchive.js); its message never names the file.
      trackAlertEvent(alert.message)
    } else if (alert.type === 'unrecognizedFormat') {
      // Also an expected outcome, but counted in Sentry too, as one info
      // issue tagged by extension (loader/unrecognizedFormat.js). GA gets the
      // constant, since the picker's message names the user's file.
      reportUnrecognizedFormat(alert)
      trackAlertEvent(UNRECOGNIZED_FORMAT_ALERT_EVENT)
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
  const isNoGeometry = alert && typeof alert === 'object' && alert.type === 'noGeometry'
  const isEntryChoice = alert && typeof alert === 'object' && alert.type === ARCHIVE_ENTRY_CHOICE
  // A rejected file whose extension we can say something useful about: a
  // Revit project, a SolidWorks part, a PDF (loader/formatGuidance.js). Only
  // the header and body change; it is still an unrecognizedFormat alert, so
  // the effect above reports it exactly as it does every other rejection.
  //
  // A zip Share looked inside and couldn't open (loader/modelArchive.js)
  // carries `archive`, what it holds or why it can't be read. The file's own
  // extension still wins: a .docx is a zip, and NOT_A_MODEL says it better.
  // A hosted `.ifczip` that couldn't be opened gets the same "why" text.
  let guidance = null
  if (alert && typeof alert === 'object' && alert.type === 'unrecognizedFormat') {
    guidance = formatGuidance(alert.ext) ?? (alert.archive ? archiveGuidance(alert.archive) : null)
  } else if (alert && typeof alert === 'object' && alert.type === ARCHIVE_UNREADABLE) {
    guidance = archiveGuidance({problem: alert.message})
  }
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

  // Dismiss without leaving the model. Every other alert here reports a load
  // that produced nothing to stay on, so closing it goes through onClose
  // (navToDefault); a no-geometry model did load, and its tree and properties
  // are still there to look at.
  const dismiss = () => setAlert(null)

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
  } else if (isNoGeometry) {
    actionCb = dismiss
    actionTitle = 'OK'
  } else if (isEntryChoice) {
    // The rows are the actions; the close button is the way out.
    actionCb = undefined
    actionTitle = undefined
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
  } else if (isNoGeometry) {
    headerText = 'No 3D geometry'
  } else if (isEntryChoice) {
    headerText = 'Choose a model'
  } else if (guidance) {
    headerText = guidance.header
  } else {
    headerText = 'Error'
  }

  // No "contact us" footer for an unsupported schema, an in-memory upload
  // whose page is gone, an upload this browser doesn't hold, or a file with
  // no geometry: all are known, documented limits or properties of the input,
  // so there is nothing for support to diagnose. A guided format is the same:
  // the guidance, and its help link, is the help.
  const showHelpFooter = !isOom && !isNeedsReconnect && !isUnsupportedSchema && !isInMemoryUploadGone &&
    !isUploadNotInBrowser && !isNoGeometry && !guidance && !isEntryChoice
  // Choosing finishes the drop or pick that raised the chooser, from inside
  // this click; closing leaves whatever model is open, as the user had it.
  const chooseEntry = (entry) => {
    const onChoose = alert.onChoose
    setAlert(null)
    Promise.resolve(onChoose(entry)).catch((e) => setAlert(e))
  }
  return (
    <Dialog
      headerText={headerText}
      isDialogDisplayed={alert !== null}
      setIsDialogDisplayed={isNoGeometry || isEntryChoice ? dismiss : onCloseInner}
      actionCb={actionCb}
      headerIcon={isNoGeometry || isEntryChoice ?
        <InfoOutlinedIcon className='icon-share'/> :
        <ErrorOutlineIcon className='icon-share'/>}
      actionTitle={actionTitle}
    >
      {isEntryChoice ? (
        <ArchiveEntryChoice
          entries={alert.entries}
          revitTextSiblings={alert.revitTextSiblings}
          onChoose={chooseEntry}
        />
      ) : guidance ? <FormatGuidanceReport guidance={guidance}/> : (
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
      )}
    </Dialog>
  )
}


/**
 * The body for a rejected file with format guidance: one paragraph per line,
 * then the help link. The link opens a new tab, as the Discord one does, so
 * reading the export steps doesn't cost the user the page they were on.
 *
 * @property {object} guidance A `FormatGuidance` from loader/formatGuidance.js
 * @return {ReactElement}
 */
function FormatGuidanceReport({guidance}) {
  return (
    <>
      {guidance.lines.map((line) => <p key={line}>{line}</p>)}
      {guidance.help && (
        <p>
          <Link href={guidance.help.href} target='_blank' rel='noopener noreferrer'>
            {guidance.help.label}
          </Link>
        </p>
      )}
    </>
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
        a.type === 'inMemoryUploadGone' || a.type === 'uploadNotInBrowser' || a.type === 'engineFailure' ||
        a.type === 'noGeometry' || a.type === 'unrecognizedFormat')) {
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
