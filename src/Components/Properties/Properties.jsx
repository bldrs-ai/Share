import React, {ReactElement, useEffect, useState} from 'react'
import {decodeIFCString} from '@bldrs-ai/ifclib'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'
import useStore from '../../store/useStore'
import {hexToRgba} from '../../utils/color'
import {createPropertyTable} from '../../utils/itemProperties'
import ExpansionPanel from './ExpansionPanel'
import {useIsMobile} from '../Hooks'
import Toggle from '../Toggle'


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
        setPropTable(await createPropertyTable(model, element))
        setPsetsList(await createPsetsList(model, element, expandAll))
      }
    })()
  }, [model, element, expandAll])

  const propSeparatorBorderOpacity = 0.3
  const propSeparatorColor = hexToRgba(theme.palette.primary.contrastText, propSeparatorBorderOpacity)
  return (
    <Box sx={{
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
          <Typography variant='body1' sx={{
            position: 'sticky',
            padding: '0 1em',
            top: '0px',
            zIndex: 10,
            backgroundColor: theme.palette.secondary.main,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `solid 1px ${theme.palette.secondary.contrastText}`,
          }}
          >
            Property Sets
            <Toggle
              checked={expandAll}
              onChange={() => setExpandAll(!expandAll)}
            />
          </Typography>
          {psetsList}
        </Box>
      }
    </Box>
)
}


/**
 * @param {object} model IFC model
 * @param {object} element IFC element
 * @param {object} classes Styles
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
