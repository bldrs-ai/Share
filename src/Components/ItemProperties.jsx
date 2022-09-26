import React, {useEffect, useState} from 'react'
import {decodeIFCString} from '@bldrs-ai/ifclib'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import {makeStyles, useTheme} from '@mui/styles'
import useStore from '../store/useStore'
import {createPropertyTable} from '../utils/itemProperties'
import ExpansionPanel from './ExpansionPanel'


/**
 * ItemProperties displays IFC element properties and possibly PropertySets
 *
 * @return {object} The ItemProperties react component
 */
export default function ItemProperties() {
  const [propTable, setPropTable] = useState(null)
  const [psetsList, setPsetsList] = useState(null)
  const [expandAll, setExpandAll] = useState(false)
  const classes = useStyles(useTheme())
  const model = useStore((state) => state.modelStore)
  const element = useStore((state) => state.selectedElement)

  useEffect(() => {
    (async () => {
      setPropTable(await createPropertyTable(model, element))
      setPsetsList(await createPsetsList(model, element, classes, expandAll))
    })()
  }, [model, element, classes, expandAll])
  return (
    <div className={classes.propsContainer}>
      {propTable}
      <div className={classes.psetContainer}>
        {psetsList && psetsList.props.children.length > 0 &&
        <Typography variant='h2' className={classes.psetTitle}>
          Property Sets
          <Switch
            checked={expandAll}
            onChange={() => setExpandAll(!expandAll)}
          />
        </Typography>
        }
        {psetsList}
      </div>
    </div>
  )
}


/**
 * @param {object} model IFC model
 * @param {object} element IFC element
 * @param {object} classes Styles
 * @param {boolean} expandAll React state expansion toggle
 * @return {object} A list of property sets react component
 */
async function createPsetsList(model, element, classes, expandAll) {
  const psets = await model.getPropertySets(element.expressID)
  return (
    <ul className={classes.psetsList}>
      {await Promise.all(
          psets.map(
              async (ps, ndx) => {
                return (
                  <ExpansionPanel
                    key={`pset-${ ndx }`}
                    summary={decodeIFCString(ps.Name.value) || 'Property Set'}
                    detail={await createPropertyTable(model, ps, true, 0)}
                    expandState={expandAll}
                  />
                )
              },
          ))}
    </ul>
  )
}


const useStyles = makeStyles((theme) => ({
  propsContainer: {
    '& td': {
      minWidth: '130px',
      maxWidth: '130px',
      verticalAlign: 'top',
      cursor: 'pointer',
      padding: '3px 0',
      borderBottom: `.2px solid ${theme.palette.highlight.heavy}`,
    },
    '& td::-webkit-scrollbar': {
      display: 'none',
    },
    '& table': {
      tableLayout: 'fixed',
      width: '100%',
      overflow: 'hidden',
      borderSpacing: 0,
    },
    '& .MuiSwitch-root': {
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
  },
  psetsList: {
    margin: 0,
    height: '100%',
    width: '100%',
    padding: '0px 0px 50px 0px',
  },
  section: {
    'listStyle': 'none',
    'width': '94%',
    '@media (max-width: 900px)': {
      width: '93%',
    },
  },
  psetContainer: {
    marginTop: '20px',
  },
  psetTitle: {
    position: 'sticky',
    top: '0px',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: theme.palette.primary.main,
    zIndex: 1000,
  },
}))
