import React, {useEffect, useState} from 'react'
import {decodeIFCString} from '@bldrs-ai/ifclib'
import {Box, List, Switch, Typography} from '@mui/material'
import useStore from '../../store/useStore'
import {createPropertyTable} from '../../utils/itemProperties'
import ExpansionPanel from '../ExpansionPanel'


/**
 * ItemProperties displays IFC element properties and possibly PropertySets
 *
 * @return {object} The ItemProperties react component
 */
export default function ItemProperties() {
  const [propTable, setPropTable] = useState(null)
  const [psetsList, setPsetsList] = useState(null)
  const [expandAll, setExpandAll] = useState(false)
  const model = useStore((state) => state.modelStore)
  const element = useStore((state) => state.selectedElement)

  useEffect(() => {
    (async () => {
      setPropTable(await createPropertyTable(model, element))
      setPsetsList(await createPsetsList(model, element, expandAll))
    })()
  }, [model, element, expandAll])

  return (
    <Box
      sx={(theme) => ({
        '& table': {
          tableLayout: 'fixed',
          width: '100%',
          overflow: 'hidden',
          borderSpacing: 0,
        },
        '& td': {
          'minWidth': '130px',
          'maxWidth': '130px',
          'verticalAlign': 'top',
          'cursor': 'pointer',
          'padding': '3px 0',
          'borderBottom': `.2px solid ${theme.palette.highlight.heavy}`,
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        },
      })}
    >
      {propTable}
      <Box
        sx={{
          marginTop: '20px',
        }}
      >
        {psetsList && psetsList.props.children.length > 0 && (
          <Typography
            sx={(theme) => ({
              position: 'sticky',
              top: '0px',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: theme.palette.primary.main,
              zIndex: 1000,
            })}
            variant='h2'
          >
            Property Sets
            <Switch
              sx={(theme) => ({
                '.MuiSwitch-root': {
                  float: 'right',
                },
                '& .MuiSwitch-track': {
                  backgroundColor: theme.palette.highlight.secondary,
                  opacity: 0.8,
                  border: 'solid 2px grey',
                },
                '& .MuiSwitch-thumb': {
                  backgroundColor: theme.palette.highlight.main,
                },
              })}
              checked={expandAll}
              onChange={() => setExpandAll(!expandAll)}
            />
          </Typography>
        )}
        {psetsList}
      </Box>
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
    <List
      sx={{
        margin: 0,
        height: '100%',
        width: '100%',
        padding: '0px 0px 50px 0px',
      }}
    >
      {
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
        )
      }
    </List>
  )
}
