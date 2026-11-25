import React, {ReactElement} from 'react'
import {Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, Snackbar, Typography} from '@mui/material'
import {formatNextFreeSlot} from '../../export/exportSlots'
import {PERIOD_DAYS} from '../../quota/period'
import useStore from '../../store/useStore'
import {useQuotaActions} from './QuotaLimitDialog'


/**
 * The anonymous remote-load meter's sign-in gate (design/new/quotas.md
 * §"Anonymous metering"): shown when a signed-out visitor opens one remote
 * model (GitHub, Google Drive, a URL) past their free ones this period, or
 * from a network past its day's cap. The model did not open. Signing in is
 * the way on: a free account opens public models without limit, and the
 * period's count carries into it (useAnonMeterLink), so it can't be reset by
 * signing in and out. Local files and the samples stay open to everyone.
 *
 * Driven by the store's `anonMeterGate` (OpenSlice), which CadView's load
 * sets; rendered once, by ViewerContainer. Sends no analytics of its own:
 * the server counts the gate stage (meter.js).
 *
 * @return {ReactElement}
 */
export default function AnonLimitDialog() {
  const gate = useStore((state) => state.anonMeterGate)
  const setGate = useStore((state) => state.setAnonMeterGate)
  const {signIn} = useQuotaActions()
  const onClose = () => setGate(null)
  const isNetwork = gate?.gatedBy === 'ip'
  const until = gate?.periodEnd ? formatNextFreeSlot(gate.periodEnd) : null
  return (
    <Dialog
      open={Boolean(gate)}
      onClose={onClose}
      maxWidth='xs'
      fullWidth
      closeAfterTransition={false}
      data-testid='anon-limit-dialog'
    >
      <DialogTitle sx={{pb: 1}}>Sign in to open more models</DialogTitle>
      <DialogContent>
        <Typography variant='body2' sx={{mb: 2}} data-testid='anon-limit-text'>
          {isNetwork ?
            'This network has opened its free models from GitHub, Google Drive and links for today.' :
            `You've opened your ${gate?.limit ?? ''} free models from GitHub, Google Drive and links for this` +
              ` ${PERIOD_DAYS}-day period${until ? `, which ends ${until}` : ''}.`}
          {' '}Sign in free to keep opening public models, as many as you like. Files from your computer
          and the samples stay free for everyone.
          {' '}<Link href='/share/quotas'>What counts?</Link>
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid='button-anon-limit-close'>Not now</Button>
        <Button
          variant='contained'
          onClick={() => {
            onClose()
            signIn()
          }}
          data-testid='button-anon-limit-signin'
        >
          Sign in
        </Button>
      </DialogActions>
    </Dialog>
  )
}


const NOTICE_HIDE_MS = 12000


/**
 * The anonymous meter's non-blocking notice: the model just opened was the
 * visitor's last free remote model this period. The model stays open; the
 * notice says what the next one needs and offers the sign-in, then goes.
 * Driven by the store's `anonMeterNotice`, which CadView sets once the model
 * is on screen; rendered once, by ViewerContainer.
 *
 * @return {ReactElement}
 */
export function AnonLastFreeNotice() {
  const notice = useStore((state) => state.anonMeterNotice)
  const setNotice = useStore((state) => state.setAnonMeterNotice)
  const {signIn} = useQuotaActions()
  const onClose = () => setNotice(null)
  const until = notice?.periodEnd ? formatNextFreeSlot(notice.periodEnd) : null
  return (
    <Snackbar
      open={Boolean(notice)}
      autoHideDuration={NOTICE_HIDE_MS}
      onClose={(event, reason) => reason !== 'clickaway' && onClose()}
      anchorOrigin={{vertical: 'top', horizontal: 'center'}}
      data-testid='anon-last-free-notice'
    >
      <Alert
        severity='info'
        onClose={onClose}
        action={
          <Button
            color='inherit'
            size='small'
            onClick={() => {
              onClose()
              signIn()
            }}
            data-testid='button-anon-notice-signin'
          >
            Sign in
          </Button>
        }
      >
        This was your last free model from GitHub, Google Drive or a link
        {until ? ` until ${until}` : ' this period'}. Sign in free to keep opening them.
      </Alert>
    </Snackbar>
  )
}
