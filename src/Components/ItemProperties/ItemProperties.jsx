import React, {useEffect, useState} from 'react'
import {decodeIFCString} from '@bldrs-ai/ifclib'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'
import useStore from '../../store/useStore'
import {hexToRgba} from '../../utils/color'
import {createPropertyTable} from '../../utils/itemProperties'
import ExpansionPanel from '../ExpansionPanel'
import Toggle from '../Toggle'


/**
 * ItemProperties displays IFC element properties and possibly PropertySets
 *
 * @return {React.ReactElement} The ItemProperties react component
 */
export default function ItemProperties() {
  const [propTable, setPropTable] = useState(null)
  const [psetsList, setPsetsList] = useState(null)
  const [expandAll, setExpandAll] = useState(false)
  const model = useStore((state) => state.modelStore)
  const element = useStore((state) => state.selectedElement)
  const theme = useTheme()


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
      {psetsList && psetsList.props.children.length > 0 &&
        <Box sx={{
          marginTop: '10px',
        }}
        >
          <Typography variant='h2' sx={{
            position: 'sticky',
            top: '0px',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
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
 * @return {object} A list of property sets react component
 */
async function createPsetsList(model, element, expandAll) {
  const psets = await model.getPropertySets(element.expressID)
  return (
    <Box component='ul' sx={{
      margin: 0,
      height: '100%',
      width: '100%',
      padding: '0px 0px 50px 0px',
    }}
    >
      {await Promise.all(
          psets.map(
              async (ps, ndx) => {
                return (
                  <ExpansionPanel
                    key={`pset-${ndx}`}
                    summary={decodeIFCString(ps.Name.value) || 'Property Set'}
                    detail={await createPropertyTable(model, ps, true, 0)}
                    expandState={expandAll}
                  />
                )
              },
          ))}
    </Box>
  )
}
