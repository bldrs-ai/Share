import React, {ReactElement, useEffect, useRef, useState} from 'react'
import {
  Box,
  Divider,
  FormControlLabel,
  Popover,
  Radio,
  RadioGroup,
  Slider,
  Stack,
  Typography,
} from '@mui/material'
import {Visibility as ResidencyIcon} from '@mui/icons-material'
import {TooltipIconButton} from '../Buttons'
import useStore from '../../store/useStore'
import {ResidencyController, ResidencyMetric} from '../../viewer/residency/ResidencyController'
import {ColorMode, activeColorMode, hasAutoColor, setColorMode} from '../../viewer/display/colorMode'


const FULL = 100


/**
 * ResidencyControl — the model-display popover behind the "eyeball" button.
 *
 * Two sections today, both scoped to the whole model:
 *   - **Color** (view-140 S2) — Auto (Share-assigned) vs Source. Auto-coloring
 *     (#1626) repaints colorless STEP/CAD models from a palette and until now
 *     was invisible and irreversible; this is the disclosure + the off switch.
 *   - **Residency** (B2 / #1613) — a slider (100% = whole model … 0% = fully
 *     evicted) plus the priority metric that orders what survives in between.
 *     Doubles as the instrumentation surface for picking a default policy.
 *
 * One popover with sections rather than a button each: they answer adjacent
 * questions ("how does it look" / "how much of it do I see") and the bottom
 * bar is already tight on mobile. Revisit if a third section lands —
 * design/new/model-display-controls.md §9.5.
 *
 * Each section self-gates, and the button renders only if at least one has
 * something to offer: Color needs a model the palette actually applies to,
 * Residency needs batched instances to evict.
 *
 * @return {ReactElement|null}
 */
export default function ResidencyControl() {
  const model = useStore((state) => state.model)
  const viewer = useStore((state) => state.viewer)
  const selectedElement = useStore((state) => state.selectedElement)
  const [anchorEl, setAnchorEl] = useState(null)
  const [percent, setPercent] = useState(FULL)
  const [metric, setMetric] = useState(ResidencyMetric.OCCUPANCY)
  const selectedRef = useRef(null)

  // Color section state. Offered only when the synthetic palette actually
  // applies — on a model that shipped its own colors both options render
  // identically, and an inert radio group implies a choice that does
  // nothing. (The residency section below already self-gates the same way,
  // so "sections come and go" is the established shape of this popover.)
  // Seeded from the scene, not from the `autoColorParts` flag, so a model
  // that loaded with the flag off shows Source selected.
  const [colorMode, setColorModeState] = useState(ColorMode.AUTO)
  const [showColor, setShowColor] = useState(false)
  useEffect(() => {
    const applies = model ? hasAutoColor(model) : false
    setShowColor(applies)
    if (applies) {
      setColorModeState(activeColorMode(model))
    }
  }, [model])

  // Controller lifecycle belongs to an EFFECT, not useMemo: React
  // StrictMode's simulated unmount runs effect cleanups once on mount,
  // and disposing a memoized controller there would gut the instance
  // table the surviving UI keeps driving (slider moves, nothing
  // evicts). The effect recreates the controller after its own
  // cleanup, so the live one is always intact.
  const [controller, setController] = useState(null)
  useEffect(() => {
    if (!model) {
      setController(null)
      return undefined
    }
    const instance = new ResidencyController(model, {
      getCamera: () => viewer?.context?.ifcCamera?.perspectiveCamera ?? null,
      getSelectionCenter: () => selectedRef.current,
    })
    setController(instance.instanceCount > 0 ? instance : null)
    return () => instance.dispose()
  }, [model, viewer])

  // Selection center for the DISTANCE metric — resolved lazily from the
  // controller's own instance table (first instance of the selected id).
  useEffect(() => {
    selectedRef.current = null
    const expressID = selectedElement?.expressID
    if (controller && expressID !== undefined && expressID !== null) {
      const match = controller.instances.find((entry) => entry.expressID === Number(expressID))
      selectedRef.current = match ? match.center : null
      if (metric === ResidencyMetric.DISTANCE) {
        controller.apply()
      }
    }
  }, [controller, selectedElement, metric])

  if (!controller && !showColor) {
    return null
  }

  const onSlider = (event, value) => {
    setPercent(value)
    controller.setTarget(value / FULL)
  }
  const onMetric = (event) => {
    setMetric(event.target.value)
    controller.setMetric(event.target.value)
  }
  const onColorMode = (event) => {
    setColorModeState(event.target.value)
    setColorMode(model, event.target.value)
  }

  return (
    <>
      <TooltipIconButton
        title='Display'
        icon={<ResidencyIcon className='icon-share'/>}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        placement='top'
        variant='solid'
        selected={anchorEl !== null || percent < FULL || colorMode === ColorMode.SOURCE}
        dataTestId='control-button-residency'
      />
      <Popover
        open={anchorEl !== null}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        // Opens UPWARD from the bottom bar (popover bottom pinned to the
        // button top). MUI flips/repositions if it would overflow the
        // viewport, so it stays on-screen on mobile.
        anchorOrigin={{vertical: 'top', horizontal: 'center'}}
        transformOrigin={{vertical: 'bottom', horizontal: 'center'}}
      >
        <Stack spacing={1} sx={{p: 2, width: '16em'}}>
          {/*
            * "Share-assigned" is the whole point of the label — a user
            * looking at a rainbow jet engine has no way to learn the colors
            * are synthetic unless the control says so.
            */}
          {showColor &&
            <>
              <Typography variant='subtitle2'>Color</Typography>
              <RadioGroup
                value={colorMode}
                onChange={onColorMode}
                data-testid='color-mode-group'
              >
                <FormControlLabel
                  value={ColorMode.AUTO}
                  control={<Radio size='small'/>}
                  label='Auto (Share-assigned)'
                  data-testid='color-mode-auto'
                />
                <FormControlLabel
                  value={ColorMode.SOURCE}
                  control={<Radio size='small'/>}
                  label='Source'
                  data-testid='color-mode-source'
                />
              </RadioGroup>
            </>}

          {showColor && controller && <Divider/>}

          {controller &&
            <>
              <Typography variant='subtitle2'>Residency: {percent}%</Typography>
              <Slider
                value={percent}
                onChange={onSlider}
                min={0}
                max={FULL}
                data-testid='residency-slider'
              />
              <Typography variant='caption'>Priority</Typography>
              <RadioGroup value={metric} onChange={onMetric}>
                <FormControlLabel
                  value={ResidencyMetric.OCCUPANCY}
                  control={<Radio size='small'/>}
                  label='Screen occupancy'
                />
                <FormControlLabel
                  value={ResidencyMetric.MEMORY}
                  control={<Radio size='small'/>}
                  label='Memory budget'
                />
                <FormControlLabel
                  value={ResidencyMetric.DISTANCE}
                  control={<Radio size='small'/>}
                  label='Distance from selection'
                />
              </RadioGroup>
              <Box>
                <Typography variant='caption'>
                  {controller.instanceCount.toLocaleString()} parts under control
                </Typography>
              </Box>
            </>}
        </Stack>
      </Popover>
    </>
  )
}
