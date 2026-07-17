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
// Auto-dismiss animation, two phases: the whole snackbar first collapses to an
// "i"-sized circle layered directly over the "i" report control, then fades to
// zero over ANIM_FADE_MS so the icon behind is revealed — it reads as the
// snackbar turning into the icon. Runs ONLY on the automatic success dismiss;
// any manual dismiss (OK) is instant.
const ANIM_SHRINK_MS = 450
const ANIM_FADE_MS = 2000
// Extra ms past a phase before the safety timer force-finalizes (covers
// environments — jsdom — where transitions don't run).
const ANIM_SAFETY_PAD_MS = 80
// After the close render commits, restore a clean content style for the next
// snackbar use. Short — just long enough to be a separate render.
const POST_CLOSE_RESET_MS = 60
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

// Bar inner width at 100% ("0%" + 16 dots + "100%") — shorter live bars are
// space-padded to this so the closing "]", and the metrics after it, hold a
// fixed column as the fill grows (conway #301 preview feedback). The canonical
// bar string still comes from conway's shared formatter; this is browser
// display layout only.
const BAR_INNER_WIDTH = 22


/**
 * Space-pad a live stage line's bar to a fixed inner width so the closing "]"
 * — and the metrics after it — hold a fixed column as the fill grows (the
 * label+bar left half becomes fixed-width, so the row stops reflowing). The
 * canonical string still comes from conway's shared formatter; this is browser
 * display layout only. Unrecognized shapes render unchanged.
 *
 * @param {string} line e.g. "Parsing [0%....98%] 1.114s, +89 MB heap"
 * @return {string}
 */
function padLiveLine(line) {
  const open = line.indexOf('[')
  const close = line.indexOf(']', open)
  if (open === -1 || close === -1) {
    return line
  }
  const inner = line.slice(open + 1, close)
  if (inner.length >= BAR_INNER_WIDTH) {
    return line
  }
  return `${line.slice(0, close)}${' '.repeat(BAR_INNER_WIDTH - inner.length)}${line.slice(close)}`
}


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
  // Same name the page title uses (Share.jsx) — preferred for the "Loaded …"
  // grace line over the reporter's filename fallback, since a STEP header's
  // fileName is often junk.
  const model = useStore((state) => state.model)
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
  // True from the start of the dismiss animation through the close render, so
  // MUI's own Grow transition stays disabled (transitionDuration 0) and can't
  // fight the fade or flash the box back to full opacity at the end.
  const [isDismissing, setIsDismissing] = useState(false)
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
    setIsDismissing(false)
    setAnimStyle(NO_ANIM_STYLE)
    setIsLoadExpanded(false)
    setLoadResult(null)
  }


  /**
   * Finish the auto-dismiss once the circle has faded: close the snackbar but
   * keep the faded style + disabled transition through the close render (so
   * nothing flashes back to full opacity), then restore a clean style on the
   * next tick for the snackbar's next use.
   */
  const completeDismiss = () => {
    setLoadResult(null)
    setIsLoadExpanded(false)
    graceTimerRef.current = setTimeout(() => {
      setIsDismissing(false)
      setAnimStyle(NO_ANIM_STYLE)
    }, POST_CLOSE_RESET_MS)
  }


  /**
   * Animate the whole snackbar collapsing into an "i"-sized circle layered
   * directly over the "i" report control, then fading out so the icon behind
   * is revealed — the eye follows the report to where it now lives. Runs only
   * on the automatic success dismiss.
   *
   * Pure CSS transform (translate + non-uniform scale), not position:fixed:
   * the Snackbar root carries `transform: translateX(-50%)` for horizontal
   * centring, and a transformed ancestor makes position:fixed resolve
   * relative to *it*, not the viewport — so absolute coords fly off-screen.
   * A transform composes correctly through that ancestor and doesn't reflow.
   * scaleX/scaleY squish the box to a `size` square (so `border-radius:50%`,
   * which scales with the box, renders a true circle); transform-origin
   * center keeps the centre fixed under the scale, and the translate lands
   * that centre on the icon. Falls back to an instant clear if either
   * endpoint can't be measured (jsdom in tests, or the "i" not mounted yet).
   */
  const startDismissAnimation = () => {
    const contentEl = typeof document !== 'undefined' ?
      document.querySelector(SNACK_CONTENT_SELECTOR) : null
    const infoEl = typeof document !== 'undefined' ?
      document.querySelector(INFO_CONTROL_SELECTOR) : null
    const from = contentEl?.getBoundingClientRect?.()
    const to = infoEl?.getBoundingClientRect?.()
    if (!from || !to || !from.width || !to.width || !from.height) {
      finishGrace()
      return
    }
    const size = Math.max(to.width, to.height)
    const scaleX = size / from.width
    const scaleY = size / from.height
    const dx = (to.left + (to.width / HALF)) - (from.left + (from.width / HALF))
    const dy = (to.top + (to.height / HALF)) - (from.top + (from.height / HALF))
    setIsDismissing(true)
    // Phase 1: shrink to an icon-sized circle centred on the "i".
    setAnimStyle({
      transformOrigin: 'center center',
      transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`,
      borderRadius: '50%',
      overflow: 'hidden',
      pointerEvents: 'none',
      transition:
        `transform ${ANIM_SHRINK_MS}ms ease-in, border-radius ${ANIM_SHRINK_MS}ms ease-in`,
    })
    // Phase 2: once shrunk, fade the circle out so it "becomes" the icon.
    graceTimerRef.current = setTimeout(() => {
      setAnimStyle((prev) => ({
        ...prev,
        opacity: 0,
        transition: `opacity ${ANIM_FADE_MS}ms ease-out`,
      }))
      graceTimerRef.current = setTimeout(completeDismiss, ANIM_FADE_MS + ANIM_SAFETY_PAD_MS)
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
  // Live line: the padded stage line (bar padded to a fixed width so the row
  // doesn't reflow, metrics following). Grace success: "Loaded <name>",
  // preferring the page-title model name over the reporter's filename. Grace
  // error: the failure summary.
  const graceLine = (loadResult?.status === 'success' && model?.name) ?
    `Loaded ${model.name}` : (loadResult?.summaryLine ?? '')
  const shownLine = isLoadActive ? padLiveLine(currentLoadLine) : graceLine
  const lineElement = (
    <Typography
      component='span'
      sx={{...LOAD_LINE_SX, ...(isErrorGrace ? {color: 'error.main'} : {})}}
      data-testid='LoadStatusLine'
    >
      {shownLine}
    </Typography>
  )

  const loadMessage = (
    // Hug the current line's width so the snackbar doesn't sprawl. The
    // collapsed report history (a long "Model: …" line) would otherwise widen
    // the box even while hidden — width:0 keeps it out of the width calc, and
    // minWidth:100% stretches it to the box (scrolling) only once expanded.
    <Box sx={{width: 'fit-content', maxWidth: '92vw'}} data-testid='LoadStatusMessage'>
      <Collapse in={isLoadExpanded}>
        <Box
          sx={{...LOAD_LINE_SX, opacity: 0.8, mb: 0.5, width: 0, minWidth: '100%', overflowX: 'auto'}}
          data-testid='LoadStatusHistory'
        >
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
        {lineElement}
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
        // Disable MUI's own Grow transition for the load/grace view (and
        // through the dismiss animation) so it can't fight or flash the
        // shrink-to-"i" animation, which drives the content box itself.
        transitionDuration={(showLoadView || isDismissing) ? 0 : undefined}
        // Hug the content (no 288px min-width sprawl) so short lines like
        // "Loaded <name>" don't leave a wide right gap; the animation's inline
        // style overrides this while it runs.
        ContentProps={{style: animStyle, sx: {minWidth: 'auto', width: 'fit-content', maxWidth: '94vw'}}}
        data-testid='snackbar'
      />
    </>
  )
}
