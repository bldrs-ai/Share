import React, {useEffect, useState} from 'react'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import {makeStyles, useTheme} from '@mui/styles'
import {decodeIFCString} from '@bldrs-ai/ifclib'
import ExpansionPanel from './ExpansionPanel'
import useStore from '../store/useStore'
import {createPropertyTable} from '../utils/itemProperties'


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
        <Typography variant='h1' className={classes.psetTitle}>
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
                    detail={await createPropertyTable(model, ps, 0, true)}
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
      // As of https://github.com/bldrs-ai/Share/pull/148
      // There should only be 1 table data per row now.
      width: '100%',
      minWidth: '130px',
      maxWidth: '130px',
      verticalAlign: 'top',
      whiteSpace: 'nowrap',
      overflowY: 'scroll',
      cursor: 'default',
      padding: '4px 0px',
      borderBottom: `.2px solid ${theme.palette.highlight.dark}`,
    },
    '& td::-webkit-scrollbar': {
      display: 'none',
    },
    '& table': {
      tableLayout: 'fixed',
      width: '100%',
      overflow: 'hidden',
      borderSpacing: 0,
      paddingLeft: '10px',
    },
    '& .MuiSwitch-root': {
      float: 'right',
    },
    '& .MuiSwitch-track': {
      backgroundColor: theme.palette.highlight.secondary,
      opacity: 0.8,
    },
    '& .MuiSwitch-thumb': {
      backgroundColor: theme.palette.highlight.main,
    },
  },
  psetsList: {
    margin: 0,
    minHeight: '370px',
    height: '100%',
    width: '100%',
    padding: '0px 0px 50px 0px',
    overflow: 'scroll',
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
    marginLeft: '10px',
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
