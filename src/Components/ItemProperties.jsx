import React from 'react'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import Typography from '@mui/material/Typography'
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
    <table key={serial + '-table'} style={{borderBottom: '1px solid lighgrey'}}>
      <tbody>
        {
          await Promise.all(
              Object.keys(props)
                  .filter((key) => !(isPset && (key == 'expressID' || key == 'Name')))
                  .map(
                      async (key, ndx) => await prettyProps(key, props[key], viewer, ndx),
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
                  <li key={ndx} className={classes.section}>
                    <Accordion className={classes.accordian}>
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
    return null
  }
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
      return null
    case 'HasProperties':
      return await hasProperties(value, viewer, serial)
    case 'Quantities':
      return await quantities(value, viewer, serial)
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
 * @param {Object|string} value
 * @param {Object} viewer
 * @param {Number} serial
 * @return {Object}
 */
async function hasProperties(value, viewer, serial) {
  return await unpackHelper(value, viewer, serial, (dObj, rows) => {
    const name = decodeIFCString(dObj.Name.value)
    const value = decodeIFCString(dObj.NominalValue.value)
    rows.push(row(name, value, serial++ + '-row'))
  })
}


/**
 * @param {Object|string} value
 * @param {Object} viewer
 * @param {Number} serial
 * @return {Object}
 */
async function quantities(value, viewer, serial) {
  return await unpackHelper(value, viewer, serial, (dObj, rows) => {
    const name = decodeIFCString(dObj.Name.value)
    let val = 'value'
    for (const dObjKey in dObj) {
      if (dObjKey.endsWith('Value')) {
        val = dObj[dObjKey].value
        break
      }
    }
    val = decodeIFCString(val)
    rows.push(row(name, val, serial++ + '-row'))
  })
}


/**
 * @param {Object|string} value
 * @param {Object} viewer
 * @param {Number} serial
 * @param {function} objToRow
 * @return {Object}
 */
async function unpackHelper(value, viewer, serial, objToRow) {
  // HasProperties behaves a little special.
  if (Array.isArray(value)) {
    const rows = []
    for (let i = 0; i < value.length; i++) {
      const p = value[i]
      if (p.type != 5) {
        throw new Error('HasProperties array contains non-reference type')
      }
      const refId = stoi(p.value)
      const dObj = await viewer.getProperties(0, refId)
      objToRow(dObj, rows)
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
  debug().warn('HasProperties with unknown structure: ', value)
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
      <td key="a"
        style={{
          maxWidth: '150px',
          overflowWrap: 'break-word',
          fontFamily: 'Helvetica',
          fontSize: '14px',
          fontWeight: 200,
          color: '#696969',
          paddingLeft: '4px',
          paddingRight: '4px',
        }}>{d1}</td>
      <td key="b"
        style={{
          maxWidth: '200px',
          overflowWrap: 'break-word',
          fontFamily: 'Helvetica',
          fontSize: '14px',
          fontWeight: 200,
          color: '#696969',
          paddingLeft: '4px',
          paddingRight: '4px',
        }}>{d2}</td>
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
  },
  section: {
    listStyle: 'none',
    maxWidth: '400px',
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
