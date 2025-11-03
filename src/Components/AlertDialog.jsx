import React, {ReactElement} from 'react'
import {Helmet} from 'react-helmet-async'
import Markdown from 'react-markdown'
import {useNavigate} from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Link from '@mui/material/Link'
import useStore from '../store/useStore'
import {trackAlert} from '../utils/alertTracking'
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
  const navigate = useNavigate()

  const severity = alert?.severity || 'error'
  const severityTitle = severity.charAt(0).toUpperCase() + severity.slice(1)
  const name = alert?.name || 'Error'
  const alertTitle = alert?.title || 'General error'
  const description = alert?.description || 'An error occurred.  Please reset the application and try again.'
  const actionTitle = alert?.actionTitle || 'Reset'
  const actionUrl = alert?.actionUrl || '/'

  trackAlert(name, alert)

  const onCloseInner = () => {
    setAlert(null)
    if (actionUrl === '/') {
      window.location.replace('/')
    } else if (actionUrl) {
      navigate(actionUrl)
    } else {
      onClose()
    }
  }

  const title = `${severityTitle}: ${alertTitle}`

  return (
    <Dialog
      headerText={severityTitle}
      isDialogDisplayed={alert !== null}
      setIsDialogDisplayed={onCloseInner}
      actionCb={onCloseInner}
      headerIcon={<ErrorOutlineIcon className='icon-share'/>}
      actionTitle={actionTitle}
    >
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description}/>
      </Helmet>
      <Alert severity={severity}>
        <Markdown
          components={{
            a: ({href, children, ...props}) => (
              <a
                href={href}
                rel='noreferrer'
                target='_blank'
                {...props}
              >
                {children}
              </a>
            ),
          }}
        >
          {description}
        </Markdown>
      </Alert>
      <p>
        For more help contact us on our{' '}
        <Link href='https://discord.gg/9SxguBkFfQ' target='_blank' rel='noopener noreferrer'>
          Discord
        </Link>{' '}
        for help.
      </p>
    </Dialog>
  )
}
