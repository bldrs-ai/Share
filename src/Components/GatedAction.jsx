import React, {ReactElement, useRef, useState} from 'react'
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
 * and no half-enabled hover state shows through. The child stays in the DOM
 * unchanged, so the gated control is pixel-for-pixel the real one, dimmed.
 *
 * Keyboard: the wrapper is the tab stop that matters (Enter/Space open the
 * help). The child button behind it remains focusable but inert.
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
        {children}
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
