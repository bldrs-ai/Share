import React, {ReactElement} from 'react'
import Link from '@mui/material/Link'
import {NotFoundError} from '../loader/Loader'
import useStore from '../store/useStore'
import Dialog from './Dialog'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'


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

  return (
    <Dialog
      headerText='Error'
      isDialogDisplayed={alert !== null}
      setIsDialogDisplayed={onCloseInner}
      actionCb={onCloseInner}
      headerIcon={<ErrorOutlineIcon className='icon-share'/>}
      actionTitle='Reset'
    >
      <p>
        {selectAlertReport(alert)}<br/>
        For more helop contact us on our{' '}
        <Link href='https://discord.gg/9SxguBkFfQ' target='_blank' rel='noopener noreferrer'>
          Discord
        </Link>{' '}
        for help
      </p>
    </Dialog>
  )
}


/**
 * @param {object} a
 * @return {ReactElement}
 */
function selectAlertReport(a) {
  if (typeof a === 'string') {
    return a
  } else if (typeof a === 'object') {
    if (a instanceof NotFoundError) {
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
 * @property {string} str error path, usually a long string
 * @return {string} formatted string
 */
const insertZeroWidthSpaces = (str) => {
  return str.replace(/([/_-])/g, '$1\u200B')
}
