import React, {useEffect, useState} from 'react'
import {decodeIFCString} from '@bldrs-ai/ifclib'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import useStore from '../../store/useStore'
import {createPropertyTable} from '../../utils/itemProperties'
import Toggle from '../Toggle'
import ExpansionPanel from './ExpansionPanel'


/**
 * Properties displays IFC element properties and possibly PropertySets
 *
 * @return {React.ReactElement}
 */
export default function Properties() {
  const [propTable, setPropTable] = useState(null)
  const [psetsList, setPsetsList] = useState(null)
  const [expandAll, setExpandAll] = useState(false)
  const model = useStore((state) => state.model)
  const element = useStore((state) => state.selectedElement)

  useEffect(() => {
    (async () => {
      if (model && element) {
        setPropTable(await createPropertyTable(model, element))
        setPsetsList(await createPsetsList(model, element, expandAll))
      }
    })()
  }, [model, element, expandAll])

  return (
    <>
      <Toggle
        checked={expandAll}
        onChange={() => setExpandAll(!expandAll)}
      />
      <List spacing={1}>
        <ListItem>
          {propTable}
        </ListItem>

        {psetsList && psetsList.length > 0 &&
         psetsList}
      </List>
    </>
  )
}


/**
 * @param {object} model IFC model
 * @param {object} element IFC element
 * @param {object} classes Styles
 * @param {boolean} expandAll React state expansion toggle
 * @return {Array<React.ReactElement>} A list of property elts
 */
async function createPsetsList(model, element, expandAll) {
  const psets = await model.getPropertySets(element.expressID)
  return [
    await Promise.all(
        psets.map(async (ps, ndx) => {
          return (
            <ListItem key={ndx}>
              <ExpansionPanel
                summary={decodeIFCString(ps.Name.value) || 'Property Set'}
                detail={await createPropertyTable(model, ps, true, 0)}
                expandState={expandAll}
              />
            </ListItem>
          )
        }),
    ),
  ]
}
