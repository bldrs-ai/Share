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
// snackbar lingers on the "Loaded <name>" line for this long, then animates
// away toward the "i" report control. An error line has no timer — it waits
// for an explicit OK.
const GRACE_MS = 5000
// Auto-dismiss animation, two phases: the whole snackbar first collapses to a
// small circle sized/placed like the "i" report control just above it, then
// fades to zero over ~1s so it reads as "turning into" the icon. Runs ONLY on
// the automatic success dismiss; any manual dismiss (OK) is instant.
const ANIM_SHRINK_MS = 450
const ANIM_FADE_MS = 1000
// Gap between the shrunk circle's bottom and the "i" icon's top.
const ANIM_GAP_PX = 6
// Extra ms past a phase before the safety timer force-finalizes (covers
// environments — jsdom — where transitions don't run).
const ANIM_SAFETY_PAD_MS = 80
// Divisor for rect center points (half width / half height).
const HALF = 2
const NO_ANIM_STYLE = {}
// The animation's target — the post-load "i" control (LoadReportControl).
// Queried from the DOM rather than shared via ref because the two live in
// different subtrees (snackbar vs bottom bar).
const INFO_CONTROL_SELECTOR = '[data-testid="control-button-load-report"]'
// The snackbar's own content box — what we shrink into the circle. Scoped to
// our snackbar so the LoadReportControl copy-confirm snackbar isn't matched.
const SNACK_CONTENT_SELECTOR = '[data-testid="snackbar"] .MuiSnackbarContent-root'


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
  // Inline transform/size/opacity applied to the snackbar content box during
  // the shrink-to-"i" animation; empty (identity) at all other times.
  const [animStyle, setAnimStyle] = useState(NO_ANIM_STYLE)
  // Holds the pending grace timer (5s countdown, then each animation phase's
  // timer) so expand / OK / a new load can cancel it.
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
   * Animate the whole snackbar collapsing into a small circle just above the
   * "i" report control, then fading out — so the eye follows the report to
   * where it now lives. Runs only on the automatic success dismiss. Falls
   * back to an instant clear if either endpoint can't be measured (jsdom in
   * tests, or the "i" not mounted yet).
   */
  const startDismissAnimation = () => {
    const contentEl = typeof document !== 'undefined' ?
      document.querySelector(SNACK_CONTENT_SELECTOR) : null
    const infoEl = typeof document !== 'undefined' ?
      document.querySelector(INFO_CONTROL_SELECTOR) : null
    const from = contentEl?.getBoundingClientRect?.()
    const to = infoEl?.getBoundingClientRect?.()
    if (!from || !to || !from.width || !to.width) {
      finishGrace()
      return
    }
    const size = Math.max(to.width, to.height)
    const dx = (to.left + (to.width / HALF)) - (from.left + (from.width / HALF))
    // Land the circle's centre a gap above the icon's top edge.
    const dy = (to.top - ANIM_GAP_PX - (size / HALF)) - (from.top + (from.height / HALF))
    // Phase 1: collapse the box to an icon-sized circle over the "i".
    setAnimStyle({
      transform: `translate(${dx}px, ${dy}px)`,
      width: `${size}px`,
      height: `${size}px`,
      minWidth: `${size}px`,
      padding: 0,
      borderRadius: '50%',
      overflow: 'hidden',
      pointerEvents: 'none',
      transition:
        `transform ${ANIM_SHRINK_MS}ms ease-in, width ${ANIM_SHRINK_MS}ms ease-in, ` +
        `height ${ANIM_SHRINK_MS}ms ease-in, min-width ${ANIM_SHRINK_MS}ms ease-in, ` +
        `border-radius ${ANIM_SHRINK_MS}ms ease-in, padding ${ANIM_SHRINK_MS}ms ease-in`,
    })
    // Phase 2: once shrunk, fade the circle out so it "becomes" the icon.
    graceTimerRef.current = setTimeout(() => {
      setAnimStyle((prev) => ({
        ...prev,
        opacity: 0,
        transition: `opacity ${ANIM_FADE_MS}ms ease-out`,
      }))
      graceTimerRef.current = setTimeout(finishGrace, ANIM_FADE_MS + ANIM_SAFETY_PAD_MS)
    }, ANIM_SHRINK_MS)
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
    <Box sx={{maxWidth: '60vw'}} data-testid='LoadStatusMessage'>
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
          // Inherit the snackbar's light content color — the default icon
          // color is near-black and near-invisible on the dark snackbar.
          sx={{color: 'inherit'}}
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
        // The grace shrink-to-"i" animation transforms the whole content box.
        ContentProps={{style: animStyle}}
        data-testid='snackbar'
      />
    </>
  )
}
