import React, {ReactElement, useEffect, useRef, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {Box, Button, Collapse, IconButton, Snackbar, Stack, Typography} from '@mui/material'
import {
  Close as CloseIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material'
import AlertDialog from '../Components/AlertDialog'
import useStore from '../store/useStore'
import {assert} from '../utils/assert'
import {navToDefault} from '../utils/navigate'


const LOAD_LINE_SX = {
  fontFamily: 'monospace',
  fontSize: '0.75rem',
  whiteSpace: 'pre',
}

// End-of-load grace period (conway #301 UX): after a successful load the
// snackbar lingers on the "Model Loaded. Total …" line for this long, then
// animates away toward the "i" report control. An error line has no timer —
// it waits for an explicit OK.
const GRACE_MS = 5000
// Shrink-to-"i" animation duration. The animation runs ONLY on the automatic
// success dismiss; any manual dismiss (OK, or OK after expanding) is instant.
const ANIM_MS = 500
// Extra ms past ANIM_MS before the safety timer force-finalizes the grace
// (covers environments — jsdom — where `transitionend` never fires).
const ANIM_SAFETY_PAD_MS = 50
// Terminal scale of the shrinking snackbar — small enough to read as
// "collapsing into the icon" without vanishing before it arrives.
const ANIM_END_SCALE = 0.08
// Divisor for rect center points (half width / half height).
const HALF = 2
const NO_ANIM_STYLE = {}
// data-testid of the post-load "i" control (LoadReportControl) — the
// animation's target. Queried from the DOM rather than shared via ref
// because the two live in different subtrees (snackbar vs bottom bar).
const INFO_CONTROL_SELECTOR = '[data-testid="control-button-load-report"]'


/** @return {ReactElement} */
export default function AlertAndSnackbar() {
  const appPrefix = useStore((state) => state.appPrefix)

  const snackMessage = useStore((state) => state.snackMessage)
  const setSnackMessage = useStore((state) => state.setSnackMessage)

  // Live load-log surface (conway #301): while a load runs, the snackbar
  // shows the current stage line with an expand toggle for the accumulated
  // report — the same lines the JS console shows. Once the load settles,
  // `loadResult` drives the grace view (final line + OK + shrink-to-"i").
  const currentLoadLine = useStore((state) => state.currentLoadLine)
  const loadReportLines = useStore((state) => state.loadReportLines)
  const loadResult = useStore((state) => state.loadResult)
  const setLoadResult = useStore((state) => state.setLoadResult)
  const isLoadActive = currentLoadLine !== null
  const isGrace = loadResult !== null
  const showLoadView = isLoadActive || isGrace

  const [isSnackOpen, setIsSnackOpen] = useState(false)
  const [text, setText] = useState(null)
  const [duration, setDuration] = useState(null)
  const [isLoadExpanded, setIsLoadExpanded] = useState(false)
  // Inline transform/opacity applied to the grace message during the
  // shrink-to-"i" animation; empty (identity) at all other times.
  const [animStyle, setAnimStyle] = useState(NO_ANIM_STYLE)
  const messageRef = useRef(null)
  // Holds the pending grace timer (5s countdown, then the animation's own
  // safety timer) so expand / OK / a new load can cancel it.
  const graceTimerRef = useRef(null)

  const navigate = useNavigate()


  useEffect(() => {
    if (snackMessage === null) {
      setIsSnackOpen(false)
      return
    }
    if (typeof snackMessage === 'string') {
      setText(snackMessage)
      setDuration(null)
    } else {
      assert(typeof snackMessage.text === 'string' && snackMessage.text.length > 0,
        'snackMessage.text must be valid string')
      assert(typeof snackMessage.autoDismiss === 'boolean' && snackMessage.autoDismiss,
        'snackMessage.autoDismiss must be true')
      setText(snackMessage.text)
      const dismissTimeMs = 5000
      setDuration(dismissTimeMs)
    }
    setIsSnackOpen(true)
  }, [snackMessage, setIsSnackOpen])


  /** Clear the grace view (and any pending timer/animation) immediately. */
  const finishGrace = () => {
    clearTimeout(graceTimerRef.current)
    graceTimerRef.current = null
    setAnimStyle(NO_ANIM_STYLE)
    setIsLoadExpanded(false)
    setLoadResult(null)
  }


  /**
   * Animate the grace message shrinking toward the "i" report control, then
   * clear it. Runs only on the automatic success dismiss — it exists purely
   * to draw the eye to where the report moves. Falls back to an instant
   * clear if either endpoint can't be measured (e.g. jsdom in tests).
   */
  const startDismissAnimation = () => {
    const messageEl = messageRef.current
    const infoEl = typeof document !== 'undefined' ?
      document.querySelector(INFO_CONTROL_SELECTOR) : null
    if (!messageEl || !infoEl || typeof messageEl.getBoundingClientRect !== 'function') {
      finishGrace()
      return
    }
    const from = messageEl.getBoundingClientRect()
    const to = infoEl.getBoundingClientRect()
    const dx = (to.left + (to.width / HALF)) - (from.left + (from.width / HALF))
    const dy = (to.top + (to.height / HALF)) - (from.top + (from.height / HALF))
    setAnimStyle({
      transform: `translate(${dx}px, ${dy}px) scale(${ANIM_END_SCALE})`,
      opacity: 0,
      transformOrigin: 'center center',
      transition: `transform ${ANIM_MS}ms ease-in, opacity ${ANIM_MS}ms ease-in`,
      pointerEvents: 'none',
    })
    // Safety timer: `transitionend` (below) finalizes normally, but jsdom
    // never fires it — this guarantees the grace clears either way.
    graceTimerRef.current = setTimeout(finishGrace, ANIM_MS + ANIM_SAFETY_PAD_MS)
  }


  // Start (or restart) the grace lifecycle when a load settles. Success with
  // the report collapsed gets the 5s auto-dismiss + shrink animation; an
  // error, or a report the user has already expanded, waits for OK instead.
  // Deliberately keyed on loadResult only: expanding mid-grace is handled
  // imperatively in the toggle handler so a later collapse can't revive the
  // timer.
  useEffect(() => {
    clearTimeout(graceTimerRef.current)
    graceTimerRef.current = null
    setAnimStyle(NO_ANIM_STYLE)
    if (loadResult?.status === 'success' && !isLoadExpanded) {
      graceTimerRef.current = setTimeout(startDismissAnimation, GRACE_MS)
    }
    return () => clearTimeout(graceTimerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadResult])


  /**
   * Toggle the expanded report. Expanding during the grace period cancels
   * the pending auto-dismiss + its animation (the user is now reading the
   * report, so don't yank it away) — the snackbar then stays until OK.
   */
  const onToggleExpand = () => {
    setIsLoadExpanded((wasExpanded) => !wasExpanded)
    if (isGrace && graceTimerRef.current !== null) {
      clearTimeout(graceTimerRef.current)
      graceTimerRef.current = null
    }
  }


  // The load view takes over the snackbar while a load is active or settling
  // — never auto-dismisses via MUI (grace runs its own timer) and stays open
  // regardless of snackMessage.
  const snackOpen = showLoadView || isSnackOpen
  const snackDuration = showLoadView ? null : duration
  const isErrorGrace = loadResult?.status === 'error'
  const displayLine = currentLoadLine ?? loadResult?.summaryLine ?? ''

  const loadMessage = (
    <Box
      ref={messageRef}
      style={animStyle}
      sx={{maxWidth: '60vw'}}
      data-testid='LoadStatusMessage'
      onTransitionEnd={() => {
        if (animStyle.transition !== undefined) {
          finishGrace()
        }
      }}
    >
      <Collapse in={isLoadExpanded}>
        <Box sx={{...LOAD_LINE_SX, opacity: 0.8, mb: 0.5, overflowX: 'auto'}} data-testid='LoadStatusHistory'>
          {loadReportLines.map((line, index) => (
            <div key={index}>{line}</div>
          ))}
        </Box>
      </Collapse>
      <Stack direction='row' alignItems='center' spacing={0.5}>
        <IconButton
          size='small'
          aria-label={isLoadExpanded ? 'Collapse load log' : 'Expand load log'}
          onClick={onToggleExpand}
          data-testid='LoadStatusExpandToggle'
        >
          {isLoadExpanded ? <ExpandMoreIcon fontSize='inherit'/> : <ExpandLessIcon fontSize='inherit'/>}
        </IconButton>
        <Typography
          component='span'
          sx={{...LOAD_LINE_SX, ...(isErrorGrace ? {color: 'error.main'} : {})}}
          data-testid='LoadStatusLine'
        >
          {displayLine}
        </Typography>
      </Stack>
    </Box>
  )

  const textMessage = (
    <Typography
      variant='body2'
      sx={{
        maxWidth: '19em',
        overflowWrap: 'break-word',
      }}
    >
      {text}
    </Typography>
  )

  // OK ends the grace period immediately with no animation (the animation is
  // reserved for the automatic success dismiss).
  const graceAction = (
    <Button
      onClick={finishGrace}
      size='small'
      sx={{marginRight: '-.5em'}}
      data-testid='LoadStatusOk'
    >
      OK
    </Button>
  )

  const closeAction = (
    <IconButton
      onClick={() => setIsSnackOpen(false)}
      size='small'
      sx={{marginRight: '-.5em'}}
    >
      <CloseIcon color='primary' fontSize='inherit'/>
    </IconButton>
  )

  let snackAction = closeAction
  if (isGrace) {
    snackAction = graceAction
  } else if (isLoadActive) {
    snackAction = null
  }


  return (
    <>
      <AlertDialog
        onClose={() => {
          setSnackMessage(null)
          navToDefault(navigate, appPrefix)
        }}
      />
      <Snackbar
        anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}
        autoHideDuration={snackDuration}
        sx={{marginBottom: '-.3em'}}
        open={snackOpen}
        onClose={() => setIsSnackOpen(false)}
        action={snackAction}
        message={showLoadView ? loadMessage : textMessage}
        data-testid='snackbar'
      />
    </>
  )
}
