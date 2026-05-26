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
  const [propTable, setPropTable] = useState(null)
  const [psetsList, setPsetsList] = useState(null)
  const [expandAll, setExpandAll] = useState(false)

  const theme = useTheme()
  const isMobile = useIsMobile()

  useEffect(() => {
    (async () => {
      if (model && element) {
        // Resolve `element` to the full IFC entity before rendering.
        // `selectedElement` is a spatial-tree node — for cache-miss
        // IFC it carries full IFC properties (wit-three's
        // `getSpatialStructure(0, true)` inlines them); for cache-hit
        // GLB it's the slim whitelist {expressID, type, Name,
        // LongName, children} captured by `bldrsSpatialTree.js`.
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
