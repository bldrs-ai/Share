import React, {ReactElement, useEffect, useState} from 'react'
import {decodeIFCString} from '@bldrs-ai/ifclib'
import {Box, Paper, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {useIsMobile} from '../Hooks'
import Toggle from '../Toggle'
import useStore from '../../store/useStore'
import {hexToRgba} from '../../utils/color'
import ExpansionPanel from './ExpansionPanel'
import {createPropertyTable} from './itemProperties'


/**
 * Properties displays IFC element properties and possibly PropertySets
 *
 * @return {ReactElement}
 */
export default function Properties() {
  const model = useStore((state) => state.model)
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
    (async () => {
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
        setPropTable(await createPropertyTable(model, fullElement))
        setPsetsList(await createPsetsList(model, fullElement, expandAll))
      }
    })()
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
  return [
    await Promise.all(
      psets.map(async (ps, ndx) => {
        return (
          <ExpansionPanel
            key={`pset-${ndx}`}
            summary={decodeIFCString(ps.Name.value) || 'Property Set'}
            detail={await createPropertyTable(model, ps, true, 0)}
            expandState={expandAll}
          />
        )
      }),
    ),
  ]
}
