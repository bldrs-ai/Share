import React, {ReactElement, cloneElement, isValidElement, useRef, useState} from 'react'
import {Box, Button, Popover, Stack, Typography} from '@mui/material'
import {assertDefined} from '../utils/assert'


/**
 * An action the user can't take *yet*, kept in its normal place instead of
 * hidden: the wrapped control renders in a disabled LOOK, stays clickable,
 * and a click explains what unlocks it (#1838).
 *
 * The disabled look must NOT come from the DOM `disabled` attribute — a
 * truly disabled button swallows the click, which is exactly the event we
 * need in order to show the help (`ConnectProviderButton` has the older
 * shape: a real `disabled` plus a hover tooltip, which says nothing at all
 * on touch). So: `aria-disabled` on a focusable wrapper that owns the click,
 * and `pointer-events: none` over the child so its own handler can't fire
 * and no half-enabled hover state shows through. The child renders as the
 * control it always was, so the gated version is pixel-for-pixel the real
 * one, dimmed.
 *
 * Keyboard: the wrapper is the ONLY tab stop, and Enter/Space on it open the
 * help. `pointer-events: none` is a mouse-only defence — a keyboard user who
 * could Tab onto the control behind it and press Enter would have the
 * BROWSER dispatch a click straight to the child, running the very handler
 * the gate exists to hold back (a free user's Export would start an export
 * and collect a server denial while the help opened; a signed-out Save would
 * open the dialog). So the child is cloned with `tabIndex: -1`, which takes
 * it out of the tab order, and with the gate's own click handler, so any
 * click that does reach it — keyboard activation, a programmatic one —
 * opens the help instead. It is deliberately NOT `aria-hidden`: the wrapper
 * is a `role=button` whose accessible name comes from the child's label, and
 * hiding the child would leave a nameless button (#1838).
 *
 * @property {string} slug Identifies this gate, e.g. 'save' → `gated-save`
 * @property {string} title Help heading, e.g. 'Log in to save'
 * @property {string} body What unlocks the action
 * @property {string} actionLabel Label of the unlocking button, e.g. 'Log in'
 * @property {Function} onAction Fired when the unlocking button is clicked
 * @property {ReactElement} children The control being gated
 * @property {Function} [onOpen] Fired when the help opens (analytics)
 * @return {ReactElement}
 */
export default function GatedAction({slug, title, body, actionLabel, onAction, children, onOpen}) {
  assertDefined(slug, title, body, actionLabel, onAction, children)
  const anchorRef = useRef(null)
  const [isHelpOpen, setIsHelpOpen] = useState(false)

  const openHelp = () => {
    setIsHelpOpen(true)
    if (onOpen) {
      onOpen()
    }
  }

  const onKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      // Space would otherwise scroll the page out from under the popover.
      event.preventDefault()
      openHelp()
    }
  }

  const onActionClick = () => {
    setIsHelpOpen(false)
    onAction()
  }

  // A click that landed on the child rather than on the wrapper: keyboard
  // activation of a focused button, or a programmatic `.click()`. Stopping
  // it here keeps the wrapper's own handler from opening the help a second
  // time (and firing `onOpen` twice, which the funnel counts).
  const onChildClick = (event) => {
    event.stopPropagation()
    openHelp()
  }

  // The child stays exactly the control it was — same element, same look —
  // minus its keyboard reachability and its own click handler; see the
  // Keyboard note above. Non-element children (a bare string) can't be
  // cloned and have no handler to hold back either.
  const gatedChild = isValidElement(children) ?
    cloneElement(children, {tabIndex: -1, onClick: onChildClick}) :
    children

  return (
    <>
      <Box
        ref={anchorRef}
        role='button'
        tabIndex={0}
        aria-disabled='true'
        onClick={openHelp}
        onKeyDown={onKeyDown}
        data-testid={`gated-${slug}`}
        sx={{
          'cursor': 'not-allowed',
          'display': 'inline-flex',
          // Paint (and hit-test) in the same layer the wrapped control would
          // have: MUI's ButtonBase is `position: relative`, so a control that
          // sits under an absolutely-positioned sibling — the toolbar's
          // background Paper, over which ControlsGroup's buttons float — is
          // still clickable. A static wrapper would lose that point to the
          // Paper, and the gate would never see the click.
          'position': 'relative',
          // Dim the whole control and make it inert to the pointer, so the
          // click lands on this wrapper rather than on the child.
          '& > *': {
            opacity: 0.4,
            pointerEvents: 'none',
            color: 'text.disabled',
          },
        }}
      >
        {gatedChild}
      </Box>
      <Popover
        open={isHelpOpen}
        anchorEl={anchorRef.current}
        onClose={() => setIsHelpOpen(false)}
        anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}
        transformOrigin={{vertical: 'top', horizontal: 'center'}}
      >
        <Stack spacing={1} sx={{p: 2, maxWidth: '18em'}} data-testid='gated-help'>
          <Typography variant='subtitle1'>{title}</Typography>
          <Typography variant='body2' color='text.secondary'>{body}</Typography>
          <Box>
            <Button
              variant='contained'
              size='small'
              onClick={onActionClick}
              data-testid='gated-help-action'
            >
              {actionLabel}
            </Button>
          </Box>
        </Stack>
      </Popover>
    </>
  )
}
