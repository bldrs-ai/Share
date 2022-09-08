import React, {useEffect, useState} from 'react'
import Switch from '@mui/material/Switch'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import {makeStyles, useTheme} from '@mui/styles'
import {decodeIFCString, deref} from '@bldrs-ai/ifclib'
import debug from '../utils/debug'
import {stoi} from '../utils/strings'
import ExpansionPanel from './ExpansionPanel'
import useStore from '../store/useStore'


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
      {
        Object.keys(element).length === 0 ?
          <Typography variant={'h4'} >No element selected</Typography> :
          <>
            {propTable || 'Loading...'}
            <div className={classes.pset}>
              <Typography variant={'h4'}>
                Property Sets
                <Switch
                  checked={expandAll}
                  onChange={() => setExpandAll(!expandAll)}
                />
              </Typography>
              {psetsList || 'Loading...'}
            </div>
          </>
      }
    </div>)
}


/**
 * If string is longer than maxWidth characters, wrap it in a tooltip.
 * Otherwise wrap it in a paragraph.
 *
 * @param {string} str
 * @param {number} maxWidth (default 20)
 * @return {object} React component
 */
function paragraphMaybeWithTooltip(str, maxWidth = 15) {
  const inner = (<Typography variant='h3'>{str}</Typography>)
  return (
    str.length > maxWidth ?
      <Tooltip title={str} placement='top'>{inner}</Tooltip> : inner
  )
}


/**
 * Recursive display of tables.  The recursion is:
 *
 *    createPropertyTable -> prettyProps -> createPropertyTable
 *
 * @param {object} model IFC model
 * @param {object} ifcProps Caller should pass the root IFC element.
 * Recursive calls will pass children
 * @param {number} serial
 * @param {boolean} isPset Is property set
 * @return {object} A property table react component
 */
async function createPropertyTable(model, ifcProps, serial = 0, isPset = false) {
  const ROWS = []
  let rowKey = 0
  if (ifcProps.constructor && ifcProps.constructor.name &&
      ifcProps.constructor.name !== 'IfcPropertySet') {
    ROWS.push(
        <tr key='ifcType'>
          <td>
            <Typography variant='h3' >IFC Type:</Typography>
            {paragraphMaybeWithTooltip(ifcProps.constructor.name)}
          </td>
        </tr>)
  }
  for (const key in ifcProps) {
    if (isPset && (key === 'expressID' || key === 'Name')) {
      continue
    }
    const val = ifcProps[key]
    const propRow = await prettyProps(model, key, val, rowKey++)
    if (propRow) {
      if (propRow.key === null) {
        throw new Error(`Row for key=(${key}) created with invalid react key`)
      }
      ROWS.push(propRow)
    }
  }
  return (
    <table key={`table-${ serial++}`} >
      <tbody>{ROWS}</tbody>
    </table>
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
                  <li key={`pset-${ ndx}`} className={classes.section}>
                    <ExpansionPanel
                      summary={decodeIFCString(ps.Name.value) || 'Property Set'}
                      detail={await createPropertyTable(model, ps, 0, true)}
                      expandState={expandAll}
                      classes={classes}
                    />
                  </li>
                )
              },
          ))}
    </ul>
  )
}


/**
 * The keys are defined here:
 * https://standards.buildingsmart.org/IFC/DEV/IFC4_3/RC2/HTML/schema/ifcproductextension/lexical/ifcelement.htm
 *
 * @param {object} model IFC model
 * @param {string} propName Property name
 * @param {object | string} propValue Property value
 * @param {number} serial
 * @return {object}
 */
async function prettyProps(model, propName, propValue, serial = 0) {
  /* eslint-enable */
  let label = `${ propName}`
  const refPrefix = 'Ref'
  if (label.startsWith(refPrefix)) {
    label = label.substring(refPrefix.length)
  }
  if (propValue === null || propValue === undefined || propValue === '') {
    debug().warn(`prettyProps: skipping propName(${propName}) invalid propValue(${propValue})`)
    return null
  }
  switch (propName) {
    case 'type':
    case 'CompositionType':
    case 'GlobalId':
    case 'ObjectPlacement':
    case 'ObjectType':
    case 'OwnerHistory':
    case 'PredefinedType':
    case 'Representation':
    case 'RepresentationContexts':
    case 'Representations':
    case 'Tag':
    case 'UnitsInContext':
      debug().warn('prettyProps, skipping prop for propName: ', propName)
      return null
    case 'Coordinates':
    case 'RefLatitude':
    case 'RefLongitude':
      return row(label, dms(
          await deref(propValue[0]),
          await deref(propValue[1]),
          await deref(propValue[2])), serial)
    case 'expressID':
      return row('Express Id', propValue, serial)
    case 'Quantities':
      return await quantities(model, propValue, serial)
    case 'HasProperties':
      return await hasProperties(model, propValue, serial)
    default: {
      // Not sure where else to put this.. but seems better than handling in deref.
      if (propValue.type === 0) {
        return null
      }
      return row(
          label,
          await deref(
              propValue, model, serial,
              async (v, mdl, srl) => await createPropertyTable(mdl, v, srl)),
          serial)
    }
  }
}


/**
 * @param {object} model IFC model
 * @param {Array} hasPropertiesArr Array of HasProperties elements
 * @param {number} serial
 * @return {object} Table rows for given hasPropertiesArr
 */
async function hasProperties(model, hasPropertiesArr, serial) {
  if (!Array.isArray(hasPropertiesArr)) {
    throw new Error('hasPropertiesArr should be array')
  }
  return await unpackHelper(model, hasPropertiesArr, serial, (dObj, rows) => {
    const name = decodeIFCString(dObj.Name.value)
    const value = (dObj.NominalValue === undefined || dObj.NominalValue === null) ?
      '<error>' :
      decodeIFCString(dObj.NominalValue.value)
    rows.push(row(name, value, `${serial++ }-row`))
  })
}


/**
 * @param {object} model IFC model
 * @param {object} quantitiesObj Quantities element
 * @param {number} serial
 * @return {object} Table of quantities
 */
async function quantities(model, quantitiesObj, serial) {
  return await unpackHelper(model, quantitiesObj, serial, (ifcElt, rows) => {
    const name = decodeIFCString(ifcElt.Name.value)
    let val = 'value'
    for (const key in ifcElt) {
      if (key.endsWith('Value')) {
        val = ifcElt[key].value
        break
      }
    }
    val = decodeIFCString(val)
    rows.push(row(name, val, `${serial++ }-row`))
  })
}


/**
 * Convert a HasProperties to react component
 *
 * @param {object} model IFC model
 * @param {Array} eltArr Array of IFC elements
 * @param {number} serial
 * @param {Function} ifcToRowCb Callback to convert an IFC elt to a table row
 * @return {object} The react component or null if fail
 */
async function unpackHelper(model, eltArr, serial, ifcToRowCb) {
  // HasProperties behaves a little special.
  if (Array.isArray(eltArr)) {
    const rows = []

    for (const i in eltArr) {
      if (Object.prototype.hasOwnProperty.call(eltArr, i)) {
        const p = eltArr[i]
        const refTypeVal = 5
        if (p.type !== refTypeVal) {
          throw new Error('Array contains non-reference type')
        }
        const refId = stoi(p.value)
        if (model.getItemProperties) {
          const ifcElt = await model.getItemProperties(refId)
          ifcToRowCb(ifcElt, rows)
        } else {
          debug().warn('model has no getProperties method: ', model)
        }
      }
    }
    return (
      <tr key={`hasProps-${ serial++}`}>
        <td>
          <table>
            <tbody>{rows}</tbody>
          </table>
        </td>
      </tr>
    )
  }
  debug().warn('HasProperties with unknown structure: ', eltArr)
  return null
}


/**
 * HTML table row
 *
 * @param {object} d1 Table cell data 1
 * @param {object} d2 Table cell data 2
 * @param {number} serial
 * @return {object} Table row react component
 */
function row(d1, d2, serial) {
  if (serial === undefined) {
    throw new Error('Must have serial for key')
  }
  if (d2 === null) {
    return (
      <tr key={serial}><td colSpan="2">{d1}</td></tr>
    )
  }
  return <Row key={serial} d1={d1} d2={d2} />
}


/**
 * Wrapper component for a table row
 *
 * @param d1.d1
 * @param {object} d1 Table cell data 1
 * @param {object} d2 Table cell data 2
 * @param d1.d2
 * @return {object} The react component
 */
function Row({d1, d2}) {
  if (d1 === null || d1 === undefined ||
    d2 === null || d2 === undefined) {
    debug().warn('Row with invalid data: ', d1, d2)
  }

  return (
    <tr>
      <td colSpan={2}>
        <Typography variant='h3' >{d1}:</Typography>
        {paragraphMaybeWithTooltip(d2)}
      </td>
    </tr>
  )
}


/**
 * A coordinate in Degree-Minutes-Seconds (DMS) syntax, e..g. 1° 2' 3''
 *
 * @param {number} deg Degrees
 * @param {number} min Minutes
 * @param {number} sec Seconds
 * @return {string} Formatted DMS coorindate string
 */
const dms = (deg, min, sec) => {
  return `${deg}° ${min}' ${sec}''`
}


const useStyles = makeStyles((theme) => ({
  propsContainer: {
    '& h2, & h3, p': {
      margin: '0.25em 0',
      padding: 0,
    },
    '& h2': {
      fontSize: '1.1em',
      margin: '1em 0 0.5em 0',
    },
    '& h3': {
      fontSize: '1.05em',
    },
    '& p': {
      marginBottom: '0.25em',
      fontSize: '1.0em',
    },
    '& td': {
      // As of https://github.com/bldrs-ai/Share/pull/148
      // There should only be 1 table data per row now.
      width: '100%',
      minWidth: '130px',
      margin: 0,
      padding: 0,
      verticalAlign: 'top',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      cursor: 'default',
    },
    '& table': {
      tableLayout: 'fixed',
      width: '100%',
      overflow: 'hidden',
      borderSpacing: 0,
      paddingLeft: '14px',
    },
    '& .MuiAccordionSummary-root': {
      width: '100%',
      padding: 0,
      margin: '0 0 0.5em 0',
      borderBottom: '1px solid lightGrey',
    },
    '& .MuiAccordionSummary-root svg': {
      width: '20px',
      height: '20px',
      border: 'solid 1px grey',
      borderRadius: '50%',
      fill: theme.palette.primary.contrastText,
    },
    '& .MuiAccordionDetails-root': {
      // padding: 0,
    },
    '& .MuiSwitch-root': {
      'float': 'right',
      '& ignoreQuotesOnFloatAbove': {},
      'bottom': '0.1em',
    },
    '& .MuiSwitch-track': {
      backgroundColor: theme.palette.primary.contrastText,
      opacity: 0.5,
    },
    '& .MuiSwitch-thumb': {
      backgroundColor: theme.palette.primary.contrastText,
    },
  },
  psetsList: {
    padding: '0px',
    margin: 0,
    height: '370px',
    overflow: 'scroll',
    width: '100%',
  },
  section: {
    'listStyle': 'none',
    'width': '94%',
    '@media (max-width: 900px)': {
      width: '93%',
    },
  },
  noElement: {
    maxWidth: '240px',
    fontSize: '20px',
    width: '240px',
  },
  icons: {
    width: '20px',
  },
  accordian: {
    width: '100%',
  },
  accordionTitle: {
    width: '200px',
    textOverflow: 'ellipsis',
    overflowWrap: 'break-word',
  },
  pset: {
    marginTop: '20px',
    marginLeft: '10px',
  },
}))
