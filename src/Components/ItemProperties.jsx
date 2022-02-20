import React, {useEffect, useState} from 'react'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'
import {makeStyles} from '@mui/styles'
import debug from '../utils/debug'
import {
  decodeIFCString,
  deref,
} from '../utils/Ifc'
import {stoi} from '../utils/strings'
import ExpandIcon from '../assets/ExpandIcon.svg'


/**
 * ItemProperties displays IFC element properties and possibly PropertySets.
 * @param {Object} model
 * @param {Object} element
 * @return {Object} The ItemProperties react component.
 */
export default function ItemProperties({model, element}) {
  const [propTable, setPropTable] = useState(null)
  const [psetsList, setPsetsList] = useState(null)
  const classes = useStyles({})


  useEffect(() => {
    (async () => {
      setPropTable(await createPropertyTable(model, element))
      setPsetsList(await createPsetsList(model, element, classes))
    })()
  }, [model, element, classes])


  return (
    <div className={classes.propsContainer}>
      <h2 className = {classes.sectionTitle}>Properties</h2>
      {propTable || 'Loading...'}
      <h2 className = {classes.sectionTitle}>Property Sets</h2>
      {psetsList || 'Loading...'}
    </div>)
}


/**
 * Recursive display of tables.
 * @param {Object} model
 * @param {Object} props
 * @param {Number} serial
 * @param {boolean} isPset Is property set.
 * @return {Object}
 */
async function createPropertyTable(model, props, serial = 0, isPset = false) {
  return (
    <table key={serial + '-table'}>
      <tbody>
        {
          await Promise.all(
              Object.keys(props)
                  .filter((key) => !(isPset && (key == 'expressID' || key == 'Name')))
                  .map(
                      async (key, ndx) => {
                        const val = props[key]
                        return await prettyProps(model, key, val, ndx)
                      },
                  ),
          )
        }
      </tbody>
    </table>
  )
}


/**
 * @param {Object} model
 * @param {Object} element
 * @param {Object} classes
 * @return {Object}
 */
async function createPsetsList(model, element, classes) {
  const psets = await model.getPropertySets(element.expressID)
  return (
    <ul className={classes.psetsList}>
      {await Promise.all(
          psets.map(
              async (ps, ndx) => {
                return (
                  <li key={ndx} className={classes.section} >
                    <Accordion className={classes.accordian} defaultExpanded={false}>
                      <AccordionSummary
                        expandIcon={<ExpandIcon className = {classes.icons} />}
                        aria-controls="panel1a-content"
                        id="panel1a-header"
                      >
                        <Typography className = {classes.accordionTitle}>
                          {decodeIFCString(ps.Name.value) || 'Property Set'}
                        </Typography>
                      </AccordionSummary>
                      <AccordionDetails className = {classes.accordianDetails}>
                        {await createPropertyTable(model, ps, 0, true)}
                      </AccordionDetails>
                    </Accordion>
                  </li>
                )
              },
          ))}
    </ul>
  )
}

/* eslint-disable max-len*/
/**
 * The keys are defined here:
 * https://standards.buildingsmart.org/IFC/DEV/IFC4_3/RC2/HTML/schema/ifcproductextension/lexical/ifcelement.htm
 * @param {Object} model
 * @param {string} key
 * @param {Object|string} value
 * @param {Number} serial
 * @param {boolean} isPset Is property set.
 * @return {Object}
 */
async function prettyProps(model, key, value, serial = 0) {
/* eslint-enable */
  let label = '' + key
  if (label.startsWith('Ref')) {
    label = label.substring(3)
  }
  if (value === null || value === undefined || value == '') {
    debug().warn(`prettyProps: undefined value(${value}) for key(${key})`)
    return null
  }
  debug().log('prettyProps, switching on key,value: ', key, value)
  switch (key) {
    case 'Coordinates':
    case 'RefLatitude':
    case 'RefLongitude':
      return row(label, dms(
          await deref(value[0]),
          await deref(value[1]),
          await deref(value[2])), serial)
    case 'expressID': return row('Express Id', value, serial)
    case 'type':
    case 'CompositionType':
    case 'GlobalId':
    case 'ObjectPlacement':
    case 'ObjectType':
    case 'OwnerHistory':
    case 'Representation':
    case 'RepresentationContexts':
    case 'Tag':
      debug().warn('prettyProps, skipping prop for key: ', key)
      return null
    case 'Quantities':
      return await quantities(model, key, value, serial)
    case 'HasProperties':
      return await hasProperties(model, key, value, serial)
    case 'UnitsInContext':
    case 'Representations':
    default:
      return row(
          label,
          await deref(value, model, serial,
              async (v, mdl, srl) => await createPropertyTable(mdl, v, srl)),
          serial)
  }
}


/**
 * @param {Object} model
 * @param {string} key Used only for debug
 * @param {Array} hasPropertiesArr
 * @param {Number} serial
 * @return {Object} Table rows for given hasPropertiesArr
 */
async function hasProperties(model, key, hasPropertiesArr, serial) {
  if (!Array.isArray(hasPropertiesArr)) {
    throw new Error('hasPropertiesArr should be array')
  }
  return await unpackHelper(model, hasPropertiesArr, serial, (dObj, rows) => {
    const name = decodeIFCString(dObj.Name.value)
    const value = (dObj.NominalValue === undefined || dObj.NominalValue == null) ?
      '<error>' :
      decodeIFCString(dObj.NominalValue.value)
    rows.push(row(name, value, serial++ + '-row'))
  })
}


/**
 * @param {Object} model
 * @param {string} key Used only for debug
 * @param {Object} quantitiesObj
 * @param {Number} serial
 * @return {Object}
 */
async function quantities(model, key, quantitiesObj, serial) {
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
    rows.push(row(name, val, serial++ + '-row'))
  })
}


/**
 * Convert a HasProperties to react component.
 * @param {Object} model
 * @param {Array} eltArr
 * @param {Number} serial
 * @param {function} ifcToRowCb Callback to convert an IFC elt to a table row
 * @return {Object} The react component or null if fail
 */
async function unpackHelper(model, eltArr, serial, ifcToRowCb) {
  // HasProperties behaves a little special.
  if (Array.isArray(eltArr)) {
    const rows = []

    for (const i in eltArr) {
      if (Object.prototype.hasOwnProperty.call(eltArr, i)) {
        const p = eltArr[i]
        if (p.type != 5) {
          throw new Error('Array contains non-reference type')
        }
        const refId = stoi(p.value)
        if (model.getItemProperties) {
          const ifcElt = await model.getItemProperties(refId)
          ifcToRowCb(ifcElt, rows)
        } else {
          console.error('model has no getProperties method: ', model)
        }
      }
    }
    return (
      <tr key={serial++}>
        <td>
          <table>
            <tbody >{rows}</tbody>
          </table>
        </td>
      </tr>
    )
  }
  debug().warn('HasProperties with unknown structure: ', eltArr)
  return null
}


/**
 * @param {Object} d1
 * @param {Object} d2
 * @param {Number} serial
 * @return {Object}
 */
function row(d1, d2, serial) {
  if (serial == undefined) {
    throw new Error('Must have serial for key')
  }
  if (d2 === null) {
    return (<tr key={serial}><td key={serial + '-double-data'} colSpan="2">{d1}</td></tr>)
  }
  return (
    <tr key={serial}>
      <Tooltip title={d1} placement="top">
        <td>{d1}</td>
      </Tooltip>
      <Tooltip title={d2} placement="top">
        <td key="b">{d2}</td>
      </Tooltip>
    </tr>
  )
}


/**
 * @param {Number} deg
 * @param {Number} min
 * @param {Number} sec
 * @return {string}
 */
const dms = (deg, min, sec) => {
  return `${deg}° ${min}' ${sec}''`
}


const useStyles = makeStyles({
  propsContainer: {
    'padding': '0.5em',
    '& td': {
      verticalAlign: 'top',
      paddingBottom: '1em',
      whiteSpace: 'nowrap',
      width: '130px',
      maxWidth: '130px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      fontFamily: 'Helvetica',
      fontSize: '14px',
      fontWeight: 200,
      paddingLeft: '4px',
      paddingRight: '4px',
      cursor: 'default',
    },
    '& td + td': {
      paddingLeft: '0.5em',
    },
    '& table': {
      tableLayout: 'fixed',
      width: '280px',
      overflow: 'hidden',
    },
  },
  psetsList: {
    padding: '0px',
    marginLeft: '10px',
    width: '308px',
    height: '400px',
    overflow: 'scroll',
    paddingBottom: '30px',
  },
  section: {
    listStyle: 'none',
    maxWidth: '400px',
    marginBottom: '5px',
  },
  sectionTitle: {
    maxWidth: '320px',
    overflowWrap: 'break-word',
    fontFamily: 'Helvetica',
    fontSize: '20px',
    fontWeight: 200,
    color: '#696969',
    paddingLeft: '4px',
    paddingRight: '4px',
    paddingBottom: '10px',
    borderBottom: ' 1px solid lightgrey',
  },
  icons: {
    width: '20px',
  },
  accordian: {
    maxWidth: '320px',
  },
  accordianDetails: {
    overflow: 'scroll',
  },
  accordionTitle: {
    width: '200px',
    textOverflow: 'ellipsis',
    overflowWrap: 'break-word',
  },
})
