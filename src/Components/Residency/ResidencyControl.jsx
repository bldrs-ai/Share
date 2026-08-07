import React, {ReactElement, useEffect, useRef, useState} from 'react'
import {
  Box,
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


const FULL = 100


/**
 * ResidencyControl — the B2 "glasses" control (#1613): a popover with a
 * residency slider (100% = whole model … 0% = fully evicted) and a
 * priority-metric selector for the eviction ordering (screen occupancy,
 * memory budget, distance from the selected part). Lets the user dial
 * in how much of a large model they want to pay for, and doubles as the
 * instrumentation surface for choosing a default eviction policy.
 *
 * Renders only when the loaded model has batched instances to control.
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

  if (!controller) {
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

  return (
    <>
      <TooltipIconButton
        title='Residency'
        icon={<ResidencyIcon className='icon-share'/>}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        placement='top'
        variant='solid'
        selected={anchorEl !== null || percent < FULL}
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
        </Stack>
      </Popover>
    </>
  )
}
