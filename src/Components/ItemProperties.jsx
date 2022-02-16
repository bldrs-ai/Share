import React from 'react'
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
 * @param {Object} viewer
 * @param {Object} element
 * @return {Object}
 */
export default function ItemProperties({viewer, element}) {
  const [propTable, setPropTable] = React.useState(null)
  const [psetsList, setPsetsList] = React.useState(null)
  const classes = useStyles({})
  React.useEffect(() => {
    (async () => {
      setPropTable(await createPropertyTable(element, viewer))
      setPsetsList(await createPsetsList(element, viewer, classes))
    })()
  }, [element, viewer, classes])

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
 * @param {Object} props
 * @param {Object} viewer
 * @param {Number} serial
 * @param {boolean} isPset Is property set.
 * @return {Object}
 */
async function createPropertyTable(props, viewer, serial = 0, isPset = false) {
  return (
    <table key={serial + '-table'}
      style={{borderBottom: '1px solid lighgrey', tableLayout: 'fixed'}}>
      <tbody>
        {
          await Promise.all(
              Object.keys(props)
                  .filter((key) => !(isPset && (key == 'expressID' || key == 'Name')))
                  .map(
                      async (key, ndx) => {
                        const val = props[key]
                        return await prettyProps(key, val, viewer, ndx)
                      },
                  ),
          )
        }
      </tbody>
    </table>
  )
}


/**
 * @param {Object} element
 * @param {Object} viewer
 * @param {Object} classes
 * @return {Object}
 */
async function createPsetsList(element, viewer, classes) {
  const psets = await viewer.IFC.loader.ifcManager.getPropertySets(0, element.expressID)
  return (
    <ul className={classes.psetsList}>
      {await Promise.all(
          psets.map(
              async (ps, ndx) => {
                return (
                  <li key={ndx} className={classes.section} >
                    <Accordion className={classes.accordian} defaultExpanded>
                      <AccordionSummary
                        expandIcon={<ExpandIcon className = {classes.icons} />}
                        aria-controls="panel1a-content"
                        id="panel1a-header"
                      >
                        <Typography>{decodeIFCString(ps.Name.value) || 'Property Set'}</Typography>
                      </AccordionSummary>
                      <AccordionDetails className = {classes.accordianDetails}>
                        {await createPropertyTable(ps, viewer, 0, true)}
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
 * @param {string} key
 * @param {Object|string} value
 * @param {Object} viewer
 * @param {Number} serial
 * @param {boolean} isPset Is property set.
 * @return {Object}
 */
async function prettyProps(key, value, viewer, serial = 0) {
/* eslint-enable */
  let label = '' + key
  if (label.startsWith('Ref')) {
    label = label.substring(3)
  }
  if (value === null || value === undefined || value == '') {
    console.warn(`prettyProps: undefined value(${value}) for key(${key})`)
    return null
  }
  console.log('prettyProps, switching on key,value: ', key, value)
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
      return await quantities(key, value, viewer, serial)
    case 'HasProperties':
      return await hasProperties(key, value, viewer, serial)
    case 'UnitsInContext':
    case 'Representations':
    default:
      return row(
          label,
          await deref(value, viewer, serial,
              async (v, vwr, srl) => await createPropertyTable(v, vwr, srl)),
          serial)
  }
}


/**
 * @param {string} key Used only for debug
 * @param {Array} hasPropertiesArr
 * @param {Object} viewer
 * @param {Number} serial
 * @return {Object} Table rows for given hasPropertiesArr
 */
async function hasProperties(key, hasPropertiesArr, viewer, serial) {
  if (!Array.isArray(hasPropertiesArr)) {
    throw new Error('hasPropertiesArr should be array')
  }
  return await unpackHelper(hasPropertiesArr, viewer, serial, (dObj, rows) => {
    const name = decodeIFCString(dObj.Name.value)
    const value = dObj.NominalValue === undefined ?
      '<error>' :
      decodeIFCString(dObj.NominalValue.value)
    rows.push(row(name, value, serial++ + '-row'))
  })
}


/**
 * @param {string} key Used only for debug
 * @param {Object} quantitiesObj
 * @param {Object} viewer
 * @param {Number} serial
 * @return {Object}
 */
async function quantities(key, quantitiesObj, viewer, serial) {
  return await unpackHelper(quantitiesObj, viewer, serial, (ifcElt, rows) => {
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
 * @param {Array} eltArr
 * @param {Object} viewer
 * @param {Number} serial
 * @param {function} ifcToRowCb Callback to convert an IFC elt to a table row
 * @return {Object} The react component or null if fail
 */
async function unpackHelper(eltArr, viewer, serial, ifcToRowCb) {
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
        const ifcElt = await viewer.getProperties(0, refId)
        ifcToRowCb(ifcElt, rows)
      }
    }
    return (
      <tr key={serial++}>
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
        <div style ={{
          fontFamily: 'Helvetica',
          fontSize: '14px',
          fontWeight: 200,
          width: '150px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          overflowWrap: 'break-word',
          wordBreak: 'break-all',
        }}>{d1}</div>
      </Tooltip>
      <Tooltip title={d2} placement="top">
        <td key="b"
          style={{
            width: '150px',
            textOverflow: 'ellipsis',
            overflowWrap: 'break-word',
            fontFamily: 'Helvetica',
            fontSize: '14px',
            fontWeight: 200,
            paddingLeft: '4px',
            paddingRight: '4px',
            cursor: 'default',
          }}>{d2}</td>
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
    },
    '& td + td': {
      paddingLeft: '0.5em',
    },
  },
  psetsList: {
    padding: '0px',
    marginLeft: '10px',
    width: '308px',
    height: '400px',
    overflow: 'scroll',
    paddingBottom: '30px',
    borderBottom: '1px solid #494747',
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

})
