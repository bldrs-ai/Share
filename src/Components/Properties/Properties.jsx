import React, {ReactElement, useEffect, useState} from 'react'
import {captureException} from '@sentry/react'
import {decodeIFCString} from '@bldrs-ai/ifclib'
import {Box, Paper, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {useIsMobile} from '../Hooks'
import NoContent from '../NoContent'
import Toggle from '../Toggle'
import useStore from '../../store/useStore'
import {selectReadModel} from '../../store/IFCSlice'
import {hexToRgba} from '../../utils/color'
import ExpansionPanel from './ExpansionPanel'
import {createPropertyTable, createPropertyTables} from './itemProperties'


/** Shown in place of a property table that could not be built. */
export const PROPERTIES_UNAVAILABLE_MESSAGE = 'Properties for this element are not available.'


/**
 * Properties displays IFC element properties and possibly PropertySets
 *
 * @return {ReactElement}
 */
export default function Properties() {
  // The indexed model while geometry still streams, so a row picked in the
  // tree before the load finishes shows its properties (open-205 #2029).
  const model = useStore(selectReadModel)
  const element = useStore((state) => state.selectedElement)
  // Tracks the GLB cache writer's in-flight state. Set by `Loader.js`'s
  // wrapper around `exportAndCacheGlb` (true before scheduling, false in
  // the writer's `.finally`). When true, the panel renders an affordance
  // explaining why hover-pick / camera-controls may feel slightly laggy
  // immediately after the first load of a fresh source. Cleared on cache
  // hit (no writer fired) so the affordance only shows when actually
  // relevant. See `src/store/IFCSlice.js#isCacheWriteInFlight`.
  const isCacheWriteInFlight = useStore((state) => state.isCacheWriteInFlight)
  // Debounced show flag. Small models' writes complete in well under
  // 250ms; we don't want the affordance to flash briefly for them — only
  // sticky-show it when the wait is actually long enough to be noticed.
  // 250ms is a few frames at 60Hz — under that the user is unlikely to
  // even notice hover-pick lag, so no need to explain it.
  const [showCacheAffordance, setShowCacheAffordance] = useState(false)
  const [propTable, setPropTable] = useState(null)
  const [psetsList, setPsetsList] = useState(null)
  const [expandAll, setExpandAll] = useState(false)

  const theme = useTheme()
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!isCacheWriteInFlight) {
      setShowCacheAffordance(false)
      return undefined
    }
    const NOTICEABLE_LATENCY_MS = 250
    const timer = setTimeout(() => setShowCacheAffordance(true), NOTICEABLE_LATENCY_MS)
    return () => clearTimeout(timer)
  }, [isCacheWriteInFlight])

  useEffect(() => {
    // Guarded against out-of-order resolution: this effect awaits twice
    // (entity fetch, then property-set assembly), and property sets can
    // take far longer for a deep container than for the element clicked
    // after it. Without the guard a slow earlier run resolved last and
    // overwrote the panel — clicking a storey then its parent building
    // left the storey's properties on screen, contradicting the
    // NavTree highlight and the breadcrumb.
    let isStale = false
    ;(async () => {
      if (model && element) {
        // Resolve `element` to the full IFC entity before rendering.
        // `selectedElement` is a spatial-tree node — for cache-miss
        // IFC it carries only Name/LongName/GlobalId handles
        // (CadView loads the tree with Conway's `'names'` mode); for
        // cache-hit GLB it's the slim whitelist {expressID, type,
        // Name, LongName, children} captured by `bldrsSpatialTree.js`.
        // `model.getItemProperties(expressID)` returns the full entity
        // in both cases (wit-three's IFCModel prototype on cache-miss;
        // the cached BLDRS_element_properties closure on cache-hit),
        // so we route through it to keep the panel identical across
        // backends.
        let fullElement = element
        if (typeof model.getItemProperties === 'function' &&
            element.expressID !== undefined) {
          try {
            const fetched = await model.getItemProperties(element.expressID)
            if (fetched) {
              fullElement = fetched
            }
          } catch (e) {
            // Fall back to the spatial-tree node — better than a
            // crash if the cached payload is missing this id.
            console.warn('Properties: getItemProperties failed; using selected element directly', e)
          }
        }
        if (isStale) {
          return
        }
        let table
        try {
          table = await createPropertyTable(model, fullElement)
        } catch (e) {
          // A table that cannot be built says so, rather than leaving the
          // PREVIOUS element's properties on screen under this selection.
          // (A throw while rendering is PropertiesPanel's ErrorBoundary's.)
          console.warn('Properties: could not build the property table', e)
          // Reported, as the unhandled rejection this used to be was (Sentry's
          // GlobalHandlers), so the next bad reference shape is still heard.
          reportBuildFailure(e, 'table', element)
          table = <NoContent message={PROPERTIES_UNAVAILABLE_MESSAGE}/>
        }
        if (isStale) {
          return
        }
        setPropTable(table)
        let psets = null
        try {
          psets = await createPsetsList(model, fullElement, expandAll)
        } catch (e) {
          console.warn('Properties: could not build the property sets', e)
          reportBuildFailure(e, 'psets', element)
        }
        if (isStale) {
          return
        }
        setPsetsList(psets)
      }
    })()
    return () => {
      isStale = true
    }
  }, [model, element, expandAll])

  const propSeparatorBorderOpacity = 0.3
  const propSeparatorColor = hexToRgba(theme.palette.primary.contrastText, propSeparatorBorderOpacity)
  return (
    <Paper
      elevation={1}
      sx={{
        'padding': '0.5em',
        'paddingBottom': isMobile ? '80px' : '0px',
        '& td': {
          minWidth: '130px',
          maxWidth: '130px',
          verticalAlign: 'top',
          cursor: 'pointer',
          padding: '3px 0',
          borderBottom: `.2px solid ${propSeparatorColor}`,
        },
        '& table': {
          tableLayout: 'fixed',
          width: '100%',
          overflow: 'hidden',
          borderSpacing: 0,
        },
      }}
    >
      {showCacheAffordance && <CacheWriteAffordance/>}
      {propTable}
      {psetsList && psetsList.length > 0 &&
        <Box sx={{
          marginTop: '10px',
        }}
        >
          <Typography
            variant='h3'
            sx={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            Property sets
            <Toggle
              checked={expandAll}
              onChange={() => setExpandAll(!expandAll)}
            />
          </Typography>
          {psetsList}
        </Box>
      }
    </Paper>
  )
}


/**
 * Send a failed property build to Sentry. Console output is not captured
 * there (loadProgress.js says why), so the panel's catches must report
 * explicitly or the failure is seen by no one.
 *
 * @param {Error} error
 * @param {string} part 'table' or 'psets'
 * @param {object} element the selected element
 */
function reportBuildFailure(error, part, element) {
  captureException(error, {tags: {component: 'Properties', part}, extra: {expressID: element?.expressID}})
}


/**
 * Small status row shown while the GLB cache writer is in flight.
 * Renders inline above the properties table so the user knows why
 * hover-pick / camera-controls may feel slightly laggy immediately
 * after the first load of a fresh source. The writer is fire-and-
 * forget for the rendered model already on screen; it's the next
 * load of the same source that benefits.
 *
 * Kept inline (rather than a child Snackbar / global toast) so the
 * affordance lives where the user naturally looks during initial
 * model exploration — the Properties panel.
 *
 * @return {ReactElement}
 */
function CacheWriteAffordance() {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 0',
        marginBottom: '4px',
        opacity: 0.7,
      }}
      data-testid='CacheWriteAffordance'
    >
      <Box
        sx={{
          'width': '8px',
          'height': '8px',
          'borderRadius': '50%',
          'backgroundColor': 'currentColor',
          'opacity': 0.5,
          'animation': 'pulseDot 1.2s ease-in-out infinite',
          '@keyframes pulseDot': {
            '0%, 100%': {opacity: 0.3},
            '50%': {opacity: 0.9},
          },
        }}
      />
      <Typography variant='caption' sx={{lineHeight: 1.2}}>
        Caching for next load…
      </Typography>
    </Box>
  )
}


/**
 * @param {object} model IFC model
 * @param {object} element IFC element
 * @param {boolean} expandAll React state expansion toggle
 * @return {Array<ReactElement>} A list of property elts
 */
async function createPsetsList(model, element, expandAll) {
  const psets = await model.getPropertySets(element.expressID)
  // One resolve for every set: under the engine worker that is one request,
  // not one per set and one per property in each (Share#2070).
  const tables = await createPropertyTables(model, psets.map((ps) => ({record: ps, isPset: true})))
  return [
    psets.map((ps, ndx) => (
      <ExpansionPanel
        key={`pset-${ndx}`}
        summary={decodeIFCString(ps.Name.value) || 'Property Set'}
        detail={tables[ndx]}
        expandState={expandAll}
      />
    )),
  ]
}
