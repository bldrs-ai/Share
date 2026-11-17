import React, {ReactElement, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore} from 'react'
import {Box, IconButton, Typography} from '@mui/material'
import {Close as CloseIcon} from '@mui/icons-material'
import {useTheme} from '@mui/material/styles'
import useStore from '../../store/useStore'
import {
  formatPerfSummary,
  getPerfStats,
  isPerfVisible,
  mountPerfPanel,
  setPerfColors,
  setPerfVisible,
  subscribePerf,
  subscribePerfStats,
  unmountPerfPanel,
} from '../../utils/PerfMonitor'
import {isRenderPanelShown, setRenderPanelShown, subscribeRenderPanel} from '../../viewer/debugPanels'


// Gap kept between an expanded panel and the Elements control under it.
const ABOVE_CONTROLS_GAP_PX = 8
// Room kept clear above an expanded panel for the top control row.
const TOP_CONTROLS_PX = 72
// Fallback clearance when the Elements control isn't on the page (a load
// error screen, a test harness): about the bottom bar's height.
const FALLBACK_CLEARANCE_PX = 64
// The Elements control (BottomBar's centre group); expanded panels sit on it.
const ELEMENTS_CONTROL_SELECTOR = '[data-testid="element-group"]'
const COUNT_FORMAT = new Intl.NumberFormat()
const PANEL_FONT_PX = 11
// Each panel's close button: about lil-gui's title-bar height, so it sits in
// the Render panel's title bar as it does in Perf's.
const CLOSE_BUTTON_PX = 20
const CLOSE_ICON_PX = 14


/**
 * The debug dock: the Perf and Render panels, left to right, centred over
 * the bottom bar's Elements control (src/viewer/debugPanels.js has when each
 * is shown: the backtick key, the Display menu's "Render...", `?feature=look`
 * / `?feature=perf`).
 *
 * Each panel minimises to its title bar. Minimised, the bar sits on the
 * window's bottom edge; expanded, the panel lifts to sit on top of the
 * Elements control, so the control stays usable under it. Both use the app
 * theme: the drawers' translucent ground and blur, the theme's text and
 * type, the accent colour for the Perf graphs and the Render panel's values.
 *
 * Render's panel is lil-gui (LightingGui), built by the viewer and mounted
 * here (`ShareViewer#mountLookPanel`), so a theme change's re-created viewer
 * lands in the same place; its own title bar is its minimise.
 *
 * @return {ReactElement|null}
 */
export default function DebugDock() {
  const theme = useTheme()
  const isPerfShown = useSyncExternalStore(subscribePerf, isPerfVisible)
  const isRenderShown = useSyncExternalStore(subscribeRenderPanel, isRenderPanelShown)
  const viewer = useStore((state) => state.viewer)
  const clearance = useElementsControlClearance(isPerfShown || isRenderShown)
  const renderHostRef = useRef(null)
  const [isRenderOpen, setIsRenderOpen] = useState(true)
  const [isRenderMounted, setIsRenderMounted] = useState(false)

  const palette = theme.palette
  const ground = palette.secondary.backgroundColor
  const text = palette.text.primary
  const accent = palette.accent?.main ?? palette.primary.main

  useEffect(() => {
    setPerfColors({fg: text, bg: palette.background.default, graph: accent})
  }, [text, accent, palette.background.default])

  useEffect(() => {
    const host = renderHostRef.current
    if (!isRenderShown || !viewer || !host) {
      setIsRenderMounted(false)
      return undefined
    }
    setIsRenderMounted(viewer.mountLookPanel?.(host, setIsRenderOpen) === true)
    return () => viewer.unmountLookPanel?.()
  }, [isRenderShown, viewer])

  if (!isPerfShown && !isRenderShown) {
    return null
  }

  const panelSx = (isOpen) => ({
    marginBottom: isOpen ? `${clearance}px` : 0,
    backgroundColor: ground,
    backdropFilter: palette.secondary.backdropFilter,
    color: text,
    borderRadius: '4px 4px 0 0',
    overflow: 'hidden',
    pointerEvents: 'auto',
  })

  return (
    // A plain flex Box, not a Stack: Stack's `spacing` resets its children's
    // margins (`margin: 0` at higher specificity), which flattened the
    // expanded panels' lift above the Elements control onto the window
    // bottom (debugPanels.spec caught it). `gap` spaces them instead.
    <Box
      data-testid='debug-dock'
      sx={{
        display: 'flex',
        // Too narrow for both side by side (a phone: Perf ~260px + Render
        // ~245px), wrap rather than run Render off the right edge.
        // `wrap-reverse` stacks the rows upward from the window bottom, so
        // Perf keeps its place on the bottom row and Render sits above it.
        // It also flips the cross axis: `flex-start` is now the bottom, which
        // is where each panel's (minimised) title bar must sit.
        flexWrap: 'wrap-reverse',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: 1,
        position: 'fixed',
        left: '50%',
        bottom: 0,
        transform: 'translateX(-50%)',
        // Over the drawers and the bottom bar; under modals and menus.
        zIndex: theme.zIndex.drawer + 2,
        // The dock's own box spans the gap between panels: let clicks there
        // reach the scene.
        pointerEvents: 'none',
        // The dock never exceeds the window: that's what makes it wrap.
        width: 'max-content',
        maxWidth: '100vw',
      }}
    >
      {isPerfShown && <PerfPanel panelSx={panelSx} accent={accent}/>}
      {isRenderShown &&
        <Box
          data-testid='render-panel-host'
          sx={{
            ...panelSx(isRenderMounted && isRenderOpen),
            'position': 'relative',
            // lil-gui themes through CSS variables it sets on `.lil-gui`; a
            // descendant selector outranks that, so these win.
            // Taller than the room above the Elements control, it scrolls.
            '& .lil-gui.root': {
              maxHeight: `calc(100dvh - ${clearance + TOP_CONTROLS_PX}px)`,
            },
            '& .lil-gui': {
              '--background-color': 'transparent',
              '--text-color': text,
              '--title-background-color': 'transparent',
              '--title-text-color': text,
              '--widget-color': palette.action.hover,
              '--hover-color': palette.action.selected,
              '--focus-color': palette.action.focus,
              '--number-color': accent,
              '--string-color': accent,
              '--font-family': theme.typography.fontFamily,
            },
            // Room on lil-gui's title bar for the close button over its end.
            '& .lil-gui.root > .lil-title': {paddingRight: `${CLOSE_BUTTON_PX + 4}px`},
          }}
        >
          {/* lil-gui owns this node's children (mountLookPanel): a separate
              host, so React never reconciles what it put there. */}
          <Box ref={renderHostRef} data-testid='render-panel-mount'/>
          <CloseButton label='Close Render' testId='render-panel-close' onClick={() => setRenderPanelShown(false)}/>
        </Box>}
    </Box>
  )
}


/**
 * The Perf panel: a title bar that minimises it (showing `fps/ms/MB`), and,
 * expanded, the three graphs and the renderer's counts.
 *
 * @property {Function} panelSx the dock's panel style, by open state
 * @property {string} accent the theme accent colour
 * @return {ReactElement}
 */
function PerfPanel({panelSx, accent}) {
  const stats = useSyncExternalStore(subscribePerfStats, getPerfStats)
  const [isOpen, setIsOpen] = useState(true)
  const graphsRef = useRef(null)

  useEffect(() => {
    if (!isOpen || !graphsRef.current) {
      return undefined
    }
    mountPerfPanel(graphsRef.current)
    // Detach before React removes the host, so it never reconciles a child
    // it doesn't own.
    return () => unmountPerfPanel()
  }, [isOpen])

  const count = (v) => (v === null || v === undefined ? '–' : COUNT_FORMAT.format(v))
  return (
    // 11px: lil-gui's size, so Perf reads as the Render panel's sibling.
    <Box data-testid='perf-panel' sx={{...panelSx(isOpen), position: 'relative', fontSize: PANEL_FONT_PX, lineHeight: 1.6}}>
      <Box
        role='button'
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setIsOpen(!isOpen)
          }
        }}
        data-testid='perf-panel-title'
        sx={{px: 1, py: 0.5, pr: `${CLOSE_BUTTON_PX + 4}px`, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap'}}
      >
        <Typography variant='inherit' component='span' sx={{fontWeight: 600}}>
          {isOpen ? '▾ Perf' : '▸ Perf '}
        </Typography>
        {!isOpen &&
          <Typography variant='inherit' component='span' sx={{color: accent}} data-testid='perf-panel-summary'>
            {formatPerfSummary(stats)}
          </Typography>}
      </Box>
      <CloseButton label='Close Perf' testId='perf-panel-close' onClick={() => setPerfVisible(false)}/>
      {isOpen &&
        <Box sx={{px: 1, pb: 1}}>
          <Box ref={graphsRef} data-testid='perf-panel-graphs'/>
          <Box
            component='dl'
            data-testid='perf-panel-counts'
            sx={{
              'display': 'grid',
              'gridTemplateColumns': 'auto auto',
              'columnGap': 2,
              'm': 0,
              'mt': 0.5,
              '& dt, & dd': {m: 0, fontSize: 'inherit'},
              '& dd': {textAlign: 'right', color: accent, fontVariantNumeric: 'tabular-nums'},
            }}
          >
            <dt>Geometries</dt><dd>{count(stats.geometries)}</dd>
            <dt>Textures</dt><dd>{count(stats.textures)}</dd>
            <dt>Draw calls</dt><dd>{count(stats.calls)}</dd>
            <dt>Triangles</dt><dd>{count(stats.triangles)}</dd>
          </Box>
        </Box>}
    </Box>
  )
}


/**
 * A panel's close button, at the top-right of its title bar. Closing hides
 * just that panel; backtick or Display > Render... brings it back.
 *
 * @property {string} label accessible name
 * @property {string} testId the button's data-testid
 * @property {Function} onClick hides the panel
 * @return {ReactElement}
 */
function CloseButton({label, testId, onClick}) {
  return (
    <IconButton
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={onClick}
      size='small'
      sx={{
        position: 'absolute',
        top: 2,
        right: 2,
        width: CLOSE_BUTTON_PX,
        height: CLOSE_BUTTON_PX,
        p: 0,
        color: 'inherit',
        zIndex: 1,
      }}
    >
      <CloseIcon sx={{fontSize: CLOSE_ICON_PX}}/>
    </IconButton>
  )
}


/**
 * How far above the window bottom an expanded panel's bottom edge sits: the
 * top of the Elements control plus a gap, followed through resizes (the
 * bottom bar's height differs by form factor, and the control can move).
 *
 * @param {boolean} isActive measure only while the dock is up
 * @return {number} px
 */
function useElementsControlClearance(isActive) {
  const [clearance, setClearance] = useState(FALLBACK_CLEARANCE_PX)
  useLayoutEffect(() => {
    if (!isActive) {
      return undefined
    }
    const measure = () => {
      const control = document.querySelector(ELEMENTS_CONTROL_SELECTOR)
      const rect = control?.getBoundingClientRect()
      setClearance(rect && rect.height > 0 ?
        Math.max(0, window.innerHeight - rect.top + ABOVE_CONTROLS_GAP_PX) :
        FALLBACK_CLEARANCE_PX)
    }
    measure()
    window.addEventListener('resize', measure)
    const control = document.querySelector(ELEMENTS_CONTROL_SELECTOR)
    const observer = control && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(control)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [isActive])
  return clearance
}
