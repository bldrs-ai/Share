import React, {ReactElement} from 'react'
import {ButtonGroup, Stack} from '@mui/material'
import useStore from '../store/useStore'
import {TooltipIconButton} from './Buttons'
import CutPlaneMenu from './CutPlane/CutPlaneMenu'
import {
  Close as CloseIcon,
  FilterCenterFocus as FilterCenterFocusIcon,
  HideSourceOutlined as HideSourceOutlinedIcon,
  VisibilityOutlined as VisibilityOutlinedIcon,
} from '@mui/icons-material'


/**
 * ElementsControl contains tools for controlling element visibility.
 *
 * State sources. Pre-2026-05 this component tracked `isIsolate` and
 * `isHidden` in React local state, mutated only by its own button
 * clicks. That drifted out of sync any time the isolator changed
 * state through another path — keyboard shortcuts (I/H/U/R via
 * `setKeydownListeners`), the per-element Hide/Unhide icon in the
 * nav tree, programmatic isolator calls, etc. — leaving the user
 * with no way to exit isolation when the Isolate button's gating
 * `selectedElement !== null` had become false (e.g. after pressing
 * `Esc` mid-isolation).
 *
 * The store's `isTempIsolationModeOn` and `hiddenElements` are
 * already the single source of truth — the isolator writes them
 * directly. This component now reads them and lets button
 * visibility follow the real state. See
 * design/new/viewer-replacement.md §3b.iii open items.
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {ReactElement}
 */
export default function ElementsControl({deselectItems}) {
  const viewer = useStore((state) => state.viewer)
  const selectedElement = useStore((state) => state.selectedElement)
  const isTempIsolationModeOn = useStore((state) => state.isTempIsolationModeOn)
  const hiddenElements = useStore((state) => state.hiddenElements)
  const isSelected = selectedElement !== null
  // `hiddenElements` is a sparse map keyed by expressID with `true`
  // for currently-hidden, `false` for explicitly-unhidden, missing
  // for never-touched. `unHideAllElements` resets to `{}`. Show the
  // "Show all" button whenever any entry is currently `true`.
  const hasHidden = Object.values(hiddenElements).some(Boolean)


  return (
    <Stack
      spacing={2}
      direction='row'
      justifyContent='center'
      alignItems='center'
      data-testid='element-group'
    >
      <ButtonGroup orientation='horizontal' variant='controls'>
        {/*
         * Cut plane stays hidden during isolation — its clipping
         * planes would interact poorly with the isolation subset
         * (which replaces the model's geometry slot).
         */}
        {!isTempIsolationModeOn && <CutPlaneMenu/>}

        {/*
         * Isolate toggle. Visible whenever there's something to
         * isolate (a selection) OR we're currently isolated —
         * critical for the "always have a way to exit isolation"
         * invariant. Without the `|| isTempIsolationModeOn` clause,
         * deselecting mid-isolation strands the user with no UI
         * affordance to leave isolation mode.
         */}
        {(isSelected || isTempIsolationModeOn) &&
         <TooltipIconButton
           title='Isolate'
           onClick={() => viewer.isolator.toggleIsolationMode()}
           icon={<FilterCenterFocusIcon className='icon-share'/>}
           placement='top'
           variant='solid'
           selected={isTempIsolationModeOn}
         />}

        {/*
         * Show all. The isolator's `unHideAllElements` guards on
         * `tempIsolationModeOn` (no-op during isolation — the
         * unhide path goes through `resetTempIsolation`'s
         * hiddenIds-aware branch). Match that guard here so the
         * button isn't a dead click during isolation; users exit
         * isolation first, then unhide.
         */}
        {hasHidden && !isTempIsolationModeOn &&
          <TooltipIconButton
            title='Show all'
            onClick={() => viewer.isolator.unHideAllElements()}
            icon={<VisibilityOutlinedIcon className='icon-share'/>}
            placement='top'
            variant='solid'
          />}

        {/*
         * Hide. Same isolation guard as `hideSelectedElements`
         * (`if (this.tempIsolationModeOn) return`) — don't surface
         * a button that no-ops.
         */}
        {isSelected && !isTempIsolationModeOn &&
         <TooltipIconButton
           title='Hide'
           onClick={() => viewer.isolator.hideSelectedElements()}
           icon={<HideSourceOutlinedIcon className='icon-share'/>}
           placement='top'
           variant='solid'
         />}

        {/*
         * Clear. Always available when something's selected,
         * including during isolation. On click, exits isolation
         * first if active — "deselect the thing I isolated" is
         * the natural read of clicking the X next to the selection
         * during isolation, and leaving isolation orphaned with no
         * selection that drove it produces the "invalid state"
         * described in the user feedback (Isolate button stays lit
         * but there's nothing logically isolated).
         */}
        {isSelected &&
         <TooltipIconButton
           title='Clear'
           onClick={() => {
             if (isTempIsolationModeOn) {
               viewer.isolator.toggleIsolationMode()
             }
             deselectItems()
           }}
           icon={<CloseIcon className='icon-share'/>}
           placement='top'
           variant='solid'
         />}
      </ButtonGroup>
    </Stack>
  )
}
