import React, {ReactElement, useEffect, useRef, useState} from 'react'
import {
  Box,
  Button,
  Divider,
  FormControlLabel,
  Popover,
  Radio,
  RadioGroup,
  Slider,
  Stack,
  Switch,
  Typography,
} from '@mui/material'
import {Visibility as ResidencyIcon} from '@mui/icons-material'
import {TooltipIconButton} from '../Buttons'
import useStore from '../../store/useStore'
import {ResidencyController, ResidencyMetric} from '../../viewer/residency/ResidencyController'
import {MotionResidency, MotionResidencyMode} from '../../viewer/residency/MotionResidency'
import {ColorMode} from '../../viewer/display/colorMode'
import {RESIDENCY_FULL} from '../../viewer/display/residencyMode'
import {ShadingMode} from '../../viewer/display/shadingMode'
import {VOLUME_DEFAULT, VOLUME_OPACITY_MAX, isDefaultVolume, volumeOf} from '../../viewer/display/volumeMode'
import {
  applyDisplayOverrides,
  applyMotionResidencyOverrides,
  applyResidencyOverrides,
  modelHasColorChoice,
  modelHasShadingChoice,
  resolvedAppearance,
} from '../../viewer/display/DisplayController'
import {isFeatureEnabled} from '../../FeatureFlags'
import {isMotionResidencyOn} from '../../viewer/display/motionResidencyMode'
import {isLookOn} from '../../viewer/lookMode'
import {setRenderPanelShown} from '../../viewer/debugPanels'
import {noteUserDisplayChange} from '../Share/viewLink'
import {readModelDisplayHash} from './displayHash'


/**
 * ResidencyControl — the model-display popover behind the "eyeball" button.
 *
 * Three sections today, all scoped to the whole model, in the order they
 * render:
 *   - **Shading** (view-140 S4) — Shaded vs Wireframe. Gated on
 *     `displayControls`, which is default-on; the gate stays because S5's
 *     scoped controls land behind it. First because it's the coarsest choice:
 *     wireframe changes what you're looking at, color only changes how the
 *     surfaces are tinted.
 *   - **Color** (view-140 S2) — Auto (Share-assigned) vs Source. Auto-coloring
 *     (#1626) repaints colorless STEP/CAD models from a palette and until now
 *     was invisible and irreversible; this is the disclosure + the off switch.
 *   - **Residency** (B2 / #1613) — a slider (100% = whole model … 0% = fully
 *     evicted) plus the priority metric that orders what survives in between.
 *     Doubles as the instrumentation surface for picking a default policy.
 *   - **While moving** (B3; on by default, `?feature=disableMotionResidency`
 *     hides it and builds no driver) — the same slider and metric for while
 *     the camera moves, plus Auto (on by default), which picks the percent
 *     from measured GPU frame time. The Residency section
 *     above becomes the at-rest setting and keeps its default and behaviour;
 *     the camera coming to rest always restores it. Shown only where the
 *     Residency section is, since it drives the same controller.
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
  // Remounted for each model object. Everything in the menu is per model
  // (the controller, the motion driver, Auto's last percent), and MUI keeps
  // closures from the FIRST render of a mounted Popover for its whole life:
  // useModal memoizes `handleClose` and `isTopModal` over its first props,
  // `children` and `onClose` among them, and those reach this component's
  // render scope and its `model`. So without a remount the first model shown
  // stayed reachable after an in-app switch (open-205, #2019; found by heap
  // snapshot, and residencyControlRetention.test.jsx). A theme change reloads
  // the model into a new object, so it remounts too, which is invisible: the
  // controller and driver were rebuilt for the new object anyway, and the
  // menu is closed while the profile menu is open.
  return <ResidencyMenu key={modelKeyOf(model)}/>
}


/**
 * The display menu for the store's model. See ResidencyControl.
 *
 * @return {ReactElement|null}
 */
function ResidencyMenu() {
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
  const {color: colorMode, shading: shadingMode, residency, motionResidency} = appearance
  const {percent, metric} = residency
  const isMotionAuto = motionResidency.mode === MotionResidencyMode.AUTO

  // Color is offered only when the synthetic palette actually applies — on a
  // model that shipped its own colors both options render identically, and an
  // inert radio group implies a choice that does nothing. (The shading and
  // residency sections self-gate the same way.)
  const showColor = modelHasColorChoice(model)

  // A volume (loader/nrrd.js): its window and opacity (volumeMode.js).
  const volumeFound = volumeOf(model)
  const volume = appearance.volume

  // Shading section (S4) — gated on `displayControls` (default-on since the
  // S7 landing; the gate is kept for S5's scoped controls). Whole-model scope.
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
      // `viewer.context` is the ThreeContext facade (three/ThreeContext.js),
      // which has no `ifcCamera`: that lives on the legacy context it wraps.
      // Reading `context.ifcCamera` here always gave null, so OCCUPANCY
      // silently ranked by world-space radius alone, ignoring the eye.
      // A disposed viewer can still be in the store until the next
      // `setViewer` (a model switch); its `getCamera` throws once
      // `ThreeContext.dispose` drops the legacy context, so that reads as
      // "no camera", as it always did, rather than throwing out of a re-rank.
      getCamera: () => {
        try {
          return viewer?.context?.getCamera?.() ?? null
        } catch {
          return null
        }
      },
      getSelectionCenter: () => selectedRef.current,
    })
    setController(instance.instanceCount > 0 ? instance : null)
    return () => instance.dispose()
  }, [model, viewer])

  // Camera-motion residency (B3), on unless `disableMotionResidency`
  // (motionResidencyMode.js#isMotionResidencyOn). Its own effect,
  // keyed on the controller it drives, so it is rebuilt — and its overlay
  // dropped — whenever the controller is. `autoPercent` is what Auto last
  // settled on, reported at each rest so the menu can show it.
  const showMotion = isMotionResidencyOn()
  const [motionDriver, setMotionDriver] = useState(null)
  const [autoPercent, setAutoPercent] = useState(null)
  useEffect(() => {
    const context = viewer?.context
    if (!showMotion || !controller || !context) {
      setMotionDriver(null)
      return undefined
    }
    const driver = new MotionResidency(controller, {
      controls: context.getCameraControls?.() ?? null,
      onFrame: (fn) => context.onFrame?.(fn) ?? null,
      renderDemand: context.getRenderDemand?.() ?? null,
      gl: context.getRenderer?.()?.getContext?.() ?? null,
      onGestureEnd: (fraction) => setAutoPercent(Math.round(fraction * RESIDENCY_FULL)),
      // Not while AO is still fading out (motionAO.js): Auto measures
      // AO-free frames only.
      shouldTime: () => !viewer?.postProcessor?.isAORunning?.(),
    })
    setMotionDriver(driver)
    return () => driver.dispose()
  }, [showMotion, controller, viewer])

  // Selection center for the DISTANCE metric — resolved lazily from the
  // controller's own instance table (first instance of the selected id).
  //
  // Both layers re-rank on every selection change, deselect included (no
  // selection falls back to occupancy ordering): at rest by re-applying when
  // the at-rest metric is DISTANCE — which before #2130 skipped the deselect
  // — and in motion by dropping the prepared DISTANCE ordering and building
  // it again in idle time, which before the owner's preview check on #2130
  // never happened at all.
  useEffect(() => {
    selectedRef.current = null
    if (!controller) {
      return
    }
    const expressID = selectedElement?.expressID
    if (expressID !== undefined && expressID !== null) {
      const match = controller.instances.find((entry) => entry.expressID === Number(expressID))
      selectedRef.current = match ? match.center : null
    }
    if (metric === ResidencyMetric.DISTANCE) {
      controller.apply()
    }
    controller.selectionChanged()
    motionDriver?.schedulePrepare()
  }, [controller, selectedElement, metric, motionDriver])

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
    // An at-rest change drops the controller's prepared motion orderings.
    motionDriver?.schedulePrepare()
  }, [controller, displayOverrides, motionDriver])

  // The motion setting reaches the driver the same way, for the same
  // ordering reason (a `#d:mres=` term can arrive before the driver exists).
  useEffect(() => {
    applyMotionResidencyOverrides(motionDriver, Object.values(displayOverrides))
  }, [motionDriver, displayOverrides])

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

  if (!controller && !showColor && !showShading && !volumeFound) {
    return null
  }

  /**
   * Move one or more axes: store (the stack owns the state), scene, then the
   * `#d:` token.
   *
   * The store set is async to this closure, so the scene apply composes the
   * NEXT appearance explicitly rather than reading `displayOverrides` back
   * this tick. The `#d:` write needn't: the live view link writes from the
   * store once the change has settled (Share/viewLink.js).
   *
   * @param {object} patch appearance axes to change
   */
  const setModelAppearance = (patch) => {
    setDisplayOverride({kind: 'model'}, patch)
    applyDisplayOverrides(model, [{scope: {kind: 'model'}, appearance: patch}])
    // The user's own change: the live view link's display term takes it from
    // here, writing `#d:` from the store once it settles (Share/viewLink.js).
    noteUserDisplayChange()
  }

  // `setDisplayOverride` merges axes but not WITHIN an axis, so a residency
  // patch has to carry both halves or the untouched one is dropped.
  const onSlider = (event, value) => {
    // Store only while dragging: the effect above pushes it at the
    // controller. Once the display term is live, the store change is what it
    // follows, debounced and in place; the user's first drag makes it live
    // on release (onChangeCommitted).
    setDisplayOverride({kind: 'model'}, {residency: {percent: value, metric}})
  }
  const onSliderCommitted = () => {
    noteUserDisplayChange()
  }
  const onMetric = (event) => {
    setModelAppearance({residency: {percent, metric: event.target.value}})
  }
  // The motion section's handlers mirror the at-rest ones: store while the
  // slider drags, the user's change noted on commit, and every patch carries
  // the whole axis.
  const onMotionSlider = (event, value) => {
    setDisplayOverride({kind: 'model'},
      {motionResidency: {...motionResidency, mode: MotionResidencyMode.MANUAL, percent: value}})
  }
  const onMotionSliderCommitted = () => {
    noteUserDisplayChange()
  }
  const onMotionAuto = (event) => {
    const mode = event.target.checked ? MotionResidencyMode.AUTO : MotionResidencyMode.MANUAL
    setModelAppearance({motionResidency: {...motionResidency, mode}})
  }
  const onMotionMetric = (event) => {
    setModelAppearance({motionResidency: {...motionResidency, metric: event.target.value}})
  }
  const onColorMode = (event) => {
    setModelAppearance({color: event.target.value})
  }
  const onShadingMode = (event) => {
    setModelAppearance({shading: event.target.value})
  }
  // The volume sliders, like the residency one: the store and the scene on
  // every tick (a uniform; nothing to rebuild), the user's change noted on
  // release. The axis carries both halves, since `setDisplayOverride` merges
  // axes but not within one.
  const setVolume = (patch) => {
    const next = {...volume, ...patch}
    setDisplayOverride({kind: 'model'}, {volume: next})
    applyDisplayOverrides(model, [{scope: {kind: 'model'}, appearance: {volume: next}}])
  }
  const onVolumeWindow = (event, value) => setVolume({window: value})
  const onVolumeOpacity = (event, value) => setVolume({opacity: value})
  const onVolumeCommitted = () => noteUserDisplayChange()
  const onVolumeReset = () => setModelAppearance({volume: {...VOLUME_DEFAULT}})

  return (
    <>
      <TooltipIconButton
        title='Display'
        icon={<ResidencyIcon className='icon-share'/>}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        placement='top'
        variant='solid'
        selected={anchorEl !== null || percent < RESIDENCY_FULL ||
          colorMode === ColorMode.SOURCE || shadingMode === ShadingMode.WIREFRAME ||
          !isDefaultVolume(volume)}
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
          {volumeFound &&
            <VolumeSection
              info={volumeFound.info}
              volume={volume}
              onWindow={onVolumeWindow}
              onOpacity={onVolumeOpacity}
              onCommitted={onVolumeCommitted}
              onReset={onVolumeReset}
            />}

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
              <Typography variant='subtitle2'>
                {motionDriver ? 'Residency at rest' : 'Residency'}: {percent}%
              </Typography>
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

          {/*
            * While moving (B3). Under Auto the slider is disabled and shows
            * what Auto last settled on, so the menu doubles as the readout
            * for tuning the policy, as the at-rest slider does for B2.
            */}
          {controller && motionDriver &&
            <>
              <Divider/>
              <Typography variant='subtitle2' data-testid='motion-residency-label'>
                While moving: {isMotionAuto ?
                  `Auto${autoPercent === null ? '' : ` (${autoPercent}%)`}` :
                  `${motionResidency.percent}%`}
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    size='small'
                    checked={isMotionAuto}
                    onChange={onMotionAuto}
                    data-testid='motion-residency-auto'
                  />
                }
                label='Auto (frame budget)'
              />
              <Slider
                value={isMotionAuto && autoPercent !== null ? autoPercent : motionResidency.percent}
                onChange={onMotionSlider}
                onChangeCommitted={onMotionSliderCommitted}
                disabled={isMotionAuto}
                min={0}
                max={RESIDENCY_FULL}
                data-testid='motion-residency-slider'
              />
              <Typography variant='caption'>Priority while moving</Typography>
              <RadioGroup
                value={motionResidency.metric}
                onChange={onMotionMetric}
                data-testid='motion-residency-metric-group'
              >
                <FormControlLabel
                  value={ResidencyMetric.OCCUPANCY}
                  control={<Radio size='small'/>}
                  label='Screen occupancy'
                  data-testid='motion-residency-metric-occupancy'
                />
                <FormControlLabel
                  value={ResidencyMetric.MEMORY}
                  control={<Radio size='small'/>}
                  label='Memory budget'
                  data-testid='motion-residency-metric-memory'
                />
                <FormControlLabel
                  value={ResidencyMetric.DISTANCE}
                  control={<Radio size='small'/>}
                  label='Distance from selection'
                  data-testid='motion-residency-metric-distance'
                />
              </RadioGroup>
            </>}

          {/* Last: the Render panel (look tuning) in the debug dock. */}
          {isLookOn() &&
            <>
              <Divider/>
              <Button
                variant='text'
                size='small'
                onClick={() => {
                  setAnchorEl(null)
                  setRenderPanelShown(true)
                }}
                sx={{justifyContent: 'flex-start', textTransform: 'none'}}
                data-testid='display-render'
              >
                Render...
              </Button>
            </>}
        </Stack>
      </Popover>
    </>
  )
}


/**
 * The Volume section: a volume's window (the range its opacity ramps over,
 * in the volume's units) and its opacity. Shown alone for a volume, which has
 * none of the other sections' choices.
 *
 * @property {object} info what nrrd.js recorded: `{range, defaultWindow, unit}`
 * @property {object} volume the axis value, `{window, opacity}`
 * @property {Function} onWindow `(event, [low, high])` while dragging
 * @property {Function} onOpacity `(event, percent)` while dragging
 * @property {Function} onCommitted on release
 * @property {Function} onReset back to the volume's defaults
 * @return {ReactElement}
 */
function VolumeSection({info, volume, onWindow, onOpacity, onCommitted, onReset}) {
  const [lo, hi] = info.range
  const window = volume.window ?? info.defaultWindow
  // About 256 steps across the range, rounded to a figure that reads well:
  // the texture holds 8 bits, so finer steps change nothing on screen.
  const step = niceStep((hi - lo) / BYTE_LEVELS)
  const unit = info.unit ? ` ${info.unit}` : ''
  const format = (value) => `${Number(value.toPrecision(SHOWN_DIGITS))}`
  // Keep the thumbs a step apart, moving back the one being dragged: equal
  // ends aren't a window (volumeMode.js#volumeOrDefault reads one as "the
  // default", and the slider would jump back to it). `disableSwap` alone lets
  // them meet.
  const onWindowChange = (event, value, activeThumb) => {
    const [low, high] = value
    if (high - low >= step) {
      onWindow(event, value)
    } else if (activeThumb === 0) {
      onWindow(event, [Math.max(lo, high - step), high])
    } else {
      onWindow(event, [low, Math.min(hi, low + step)])
    }
  }
  return (
    <>
      <Typography variant='subtitle2' data-testid='volume-window-label'>
        Window: {format(window[0])} – {format(window[1])}{unit}
      </Typography>
      <Slider
        value={window}
        onChange={onWindowChange}
        onChangeCommitted={onCommitted}
        min={lo}
        max={hi}
        step={step}
        disableSwap
        getAriaLabel={(index) => (index === 0 ? 'Window low' : 'Window high')}
        data-testid='volume-window-slider'
      />
      <Typography variant='subtitle2' data-testid='volume-opacity-label'>
        Opacity: {Math.round(volume.opacity)}%
      </Typography>
      <Slider
        value={volume.opacity}
        onChange={onOpacity}
        onChangeCommitted={onCommitted}
        min={0}
        max={VOLUME_OPACITY_MAX}
        aria-label='Opacity'
        data-testid='volume-opacity-slider'
      />
      <Box>
        <Button size='small' onClick={onReset} data-testid='volume-reset'>Reset</Button>
      </Box>
    </>
  )
}


// The volume texture's 8-bit levels, and the figures the window label shows.
const BYTE_LEVELS = 255
const SHOWN_DIGITS = 4


/**
 * A slider step near `raw`, rounded to 1, 2 or 5 times a power of ten.
 *
 * @param {number} raw
 * @return {number}
 */
function niceStep(raw) {
  if (!(raw > 0)) {
    return 1
  }
  const power = 10 ** Math.floor(Math.log10(raw))
  const scaled = raw / power
  const nice = [1, 2, 5, 10].find((m) => scaled <= m)
  return nice * power
}


// A React key per model object, for ResidencyControl's remount. A WeakMap,
// so a key never keeps its model, and any model object gets one (an
// Object3D's `uuid` would leave out the doubles and non-three models).
const modelKeys = new WeakMap()
let lastModelKey = 0


/**
 * @param {object|null} model
 * @return {number} 0 for no model, else one number per model object
 */
function modelKeyOf(model) {
  if (!model) {
    return 0
  }
  let key = modelKeys.get(model)
  if (key === undefined) {
    key = ++lastModelKey
    modelKeys.set(model, key)
  }
  return key
}
