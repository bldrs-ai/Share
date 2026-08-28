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
import {ColorMode} from '../../viewer/display/colorMode'
import {RESIDENCY_FULL} from '../../viewer/display/residencyMode'
import {ShadingMode} from '../../viewer/display/shadingMode'
import {
  applyDisplayOverrides,
  applyResidencyOverrides,
  modelHasColorChoice,
  modelHasShadingChoice,
  resolvedAppearance,
} from '../../viewer/display/DisplayController'
import {isFeatureEnabled} from '../../FeatureFlags'
import {readModelDisplayHash, writeModelDisplayHash} from './displayHash'


/**
 * ResidencyControl — the model-display popover behind the "eyeball" button.
 *
 * Three sections today, all scoped to the whole model, in the order they
 * render:
 *   - **Shading** (view-140 S4) — Shaded vs Wireframe. Behind
 *     `?feature=displayControls`. First because it's the coarsest choice:
 *     wireframe changes what you're looking at, color only changes how the
 *     surfaces are tinted.
 *   - **Color** (view-140 S2) — Auto (Share-assigned) vs Source. Auto-coloring
 *     (#1626) repaints colorless STEP/CAD models from a palette and until now
 *     was invisible and irreversible; this is the disclosure + the off switch.
 *   - **Residency** (B2 / #1613) — a slider (100% = whole model … 0% = fully
 *     evicted) plus the priority metric that orders what survives in between.
 *     Doubles as the instrumentation surface for picking a default policy.
 *
 * One popover with sections rather than a button each: they answer adjacent
 * questions ("how does it look" / "how much of it do I see") and the bottom
 * bar is already tight on mobile — design/new/model-display-controls.md §9.5,
 * which flagged three sections as the point to revisit. It's crowded but
 * still coherent; a fourth axis (opacity, hidden) should force the split.
 *
 * All three sections read and write the display-override stack, so the whole
 * menu round-trips through the `#d:` permalink (S7) — see displayHash.
 *
 * Each section self-gates, and the button renders only if at least one has
 * something to offer: Shading needs the flag plus a model with materials,
 * Color needs a model the palette actually applies to, Residency needs
 * batched instances to evict.
 *
 * @return {ReactElement|null}
 */
export default function ResidencyControl() {
  const model = useStore((state) => state.model)
  const viewer = useStore((state) => state.viewer)
  const selectedElement = useStore((state) => state.selectedElement)
  const displayOverrides = useStore((state) => state.displayOverrides)
  const setDisplayOverride = useStore((state) => state.setDisplayOverride)
  const [anchorEl, setAnchorEl] = useState(null)
  const selectedRef = useRef(null)

  // EVERY section is driven by the display-override stack (S3) — no local
  // copy of any of it. The radios and the slider write a model-scope override
  // into the store; DisplayController applies it. That's what lets the `#d:`
  // permalink (S7) round-trip the whole menu and what future scoped controls
  // (S5) will read.
  const overrideList = Object.values(displayOverrides)
  // Resolved per axis from the stack, falling back to the model's live state
  // where there is one — so a freshly loaded (default auto-colored) model
  // shows Auto without the store having to seed an override.
  const appearance = resolvedAppearance(model, overrideList)
  const {color: colorMode, shading: shadingMode, residency} = appearance
  const {percent, metric} = residency

  // Color is offered only when the synthetic palette actually applies — on a
  // model that shipped its own colors both options render identically, and an
  // inert radio group implies a choice that does nothing. (The shading and
  // residency sections self-gate the same way.)
  const showColor = modelHasColorChoice(model)

  // Shading section (S4) — behind ?feature=displayControls (additive UI
  // shipping dark), unlike the always-on color toggle. Whole-model scope.
  const showShading = isFeatureEnabled('displayControls') && modelHasShadingChoice(model)

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

  // Residency reaches the scene from HERE rather than from the slider
  // handler, because the controller is built in its own effect and does not
  // exist yet on the tick the cold-load effect below seeds the store from
  // `#d:`. Keying on (controller, overrides) closes that ordering gap in both
  // directions: a residency override that arrived first lands the moment the
  // controller appears, and a later user change lands on the next render.
  // `applyResidencyOverrides` no-ops when nothing moved, so the extra runs
  // this effect takes on unrelated axes (a color click) cost a comparison.
  useEffect(() => {
    applyResidencyOverrides(controller, Object.values(displayOverrides))
  }, [controller, displayOverrides])

  // Cold-load: apply a shared `#d:` permalink's display state to the freshly
  // loaded model, and seed the store so the controls reflect it. Mirrors how
  // CutPlaneMenu restores `cp:` on model load. Model-scope only (S7); scoped
  // terms follow with S5. Runs once per model — the model swap is the load
  // event, and re-running on override changes would fight the user's clicks.
  // The residency half of the patch is applied by the effect above, not here.
  useEffect(() => {
    if (!model) {
      return
    }
    const hashAppearance = readModelDisplayHash(window.location)
    if (Object.keys(hashAppearance).length > 0) {
      setDisplayOverride({kind: 'model'}, hashAppearance)
      applyDisplayOverrides(model, [{scope: {kind: 'model'}, appearance: hashAppearance}])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])

  if (!controller && !showColor && !showShading) {
    return null
  }

  /**
   * Move one or more axes: store (the stack owns the state), scene, then the
   * `#d:` token.
   *
   * The store set is async to this closure, so both the scene apply and the
   * hash write compose the NEXT appearance explicitly rather than reading
   * `displayOverrides` back this tick.
   *
   * @param {object} patch appearance axes to change
   */
  const setModelAppearance = (patch) => {
    setDisplayOverride({kind: 'model'}, patch)
    applyDisplayOverrides(model, [{scope: {kind: 'model'}, appearance: patch}])
    writeModelDisplayHash(window.location, {...appearance, ...patch})
  }

  // `setDisplayOverride` merges axes but not WITHIN an axis, so a residency
  // patch has to carry both halves or the untouched one is dropped.
  const onSlider = (event, value) => {
    // Store only while dragging: the effect above pushes it at the
    // controller, and the `#d:` write waits for onChangeCommitted so a drag
    // doesn't stamp a hash — and a browser history entry — per tick.
    setDisplayOverride({kind: 'model'}, {residency: {percent: value, metric}})
  }
  const onSliderCommitted = (event, value) => {
    writeModelDisplayHash(window.location, {...appearance, residency: {percent: value, metric}})
  }
  const onMetric = (event) => {
    setModelAppearance({residency: {percent, metric: event.target.value}})
  }
  const onColorMode = (event) => {
    setModelAppearance({color: event.target.value})
  }
  const onShadingMode = (event) => {
    setModelAppearance({shading: event.target.value})
  }

  return (
    <>
      <TooltipIconButton
        title='Display'
        icon={<ResidencyIcon className='icon-share'/>}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        placement='top'
        variant='solid'
        selected={anchorEl !== null || percent < RESIDENCY_FULL ||
          colorMode === ColorMode.SOURCE || shadingMode === ShadingMode.WIREFRAME}
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
          {showShading &&
            <>
              <Typography variant='subtitle2'>Shading</Typography>
              <RadioGroup
                value={shadingMode}
                onChange={onShadingMode}
                data-testid='shading-mode-group'
              >
                <FormControlLabel
                  value={ShadingMode.SHADED}
                  control={<Radio size='small'/>}
                  label='Shaded'
                  data-testid='shading-mode-shaded'
                />
                <FormControlLabel
                  value={ShadingMode.WIREFRAME}
                  control={<Radio size='small'/>}
                  label='Wireframe'
                  data-testid='shading-mode-wireframe'
                />
              </RadioGroup>
            </>}

          {showShading && showColor && <Divider/>}

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

          {(showShading || showColor) && controller && <Divider/>}

          {controller &&
            <>
              <Typography variant='subtitle2'>Residency: {percent}%</Typography>
              <Slider
                value={percent}
                onChange={onSlider}
                onChangeCommitted={onSliderCommitted}
                min={0}
                max={RESIDENCY_FULL}
                data-testid='residency-slider'
              />
              <Typography variant='caption'>Priority</Typography>
              <RadioGroup
                value={metric}
                onChange={onMetric}
                data-testid='residency-metric-group'
              >
                <FormControlLabel
                  value={ResidencyMetric.OCCUPANCY}
                  control={<Radio size='small'/>}
                  label='Screen occupancy'
                  data-testid='residency-metric-occupancy'
                />
                <FormControlLabel
                  value={ResidencyMetric.MEMORY}
                  control={<Radio size='small'/>}
                  label='Memory budget'
                  data-testid='residency-metric-memory'
                />
                <FormControlLabel
                  value={ResidencyMetric.DISTANCE}
                  control={<Radio size='small'/>}
                  label='Distance from selection'
                  data-testid='residency-metric-distance'
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
