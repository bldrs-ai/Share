import React, {useState} from 'react'
import Tooltip from '@mui/material/Tooltip'
import {makeStyles} from '@mui/styles'
import debug from '../utils/debug'
import {
  decodeIFCString,
  deref,
} from '../utils/Ifc'
import {stoi} from '../utils/strings'
import Toggle from './Toggle'
import ExpansionPanel from './ExpansionPanel'

/**
 * ItemProperties displays IFC element properties and possibly PropertySets.
 * @param {Object} viewer
 * @param {Object} element
 * @return {Object} The ItemProperties react component.
 */
export default function ItemProperties({viewer, element}) {
  const [propTable, setPropTable] = useState(null)
  const [psetsList, setPsetsList] = useState(null)
  const [expandAll, setExpandAll] = useState(false)
  const classes = useStyles({})

  React.useEffect(() => {
    (async () => {
      setPropTable(await createPropertyTable(element, viewer))
      setPsetsList(await createPsetsList(element, viewer, classes, expandAll))
    })()
  }, [element, viewer, classes, expandAll])

  return (
    <div className={classes.propsContainer}>
      <h2 className = {classes.sectionTitle}>Properties</h2>
      {propTable || 'Loading...'}
      <h2 className = {classes.sectionTitle}>
        <div>Property Sets</div>
        <Toggle onChange = {() => setExpandAll(!expandAll)} />
      </h2>
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
    <table key={serial + '-table'}>
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
 * @param {boolean} expandAll
 * @return {Object}
 */
async function createPsetsList(element, viewer, classes, expandAll) {
  const psets = await viewer.IFC.loader.ifcManager.getPropertySets(0, element.expressID)

  return (
    <ul className={classes.psetsList}>

      {await Promise.all(
          psets.map(
              async (ps, ndx) => {
                return (
                  <li key={ndx} className={classes.section}>
                    <ExpansionPanel
                      summary = { decodeIFCString(ps.Name.value) || 'Property Set'}
                      detail = {await createPropertyTable(ps, viewer, 0, true)}
                      expandState = {expandAll} classes={classes}
                    />
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
    <Row d1 = {d1} d2={d2} serial={serial} />
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

/**
 * Wrapper compoent for a table row
 * @param {String} d1
 * @param {String} d2
 * @param {Number} serial
 * @return {Object} The react component
 */
function Row({d1, d2, serial}) {
  return (
    <tr key={serial}>
      <Tooltip
        title={d1}
        placement="top">
        <td >{d1}</td>
      </Tooltip>
      <Tooltip
        title={d2}
        placement="top">
        <td key="b">{d2}</td>
      </Tooltip>
    </tr>
  )
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
    paddingBottom: '30px',
  },
  section: {
    listStyle: 'none',
    maxWidth: '400px',
    marginBottom: '5px',
  },
  sectionTitle: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItem: 'center',
    maxWidth: '320px',
    overflowWrap: 'break-word',
    fontFamily: 'Helvetica',
    fontSize: '20px',
    fontWeight: 200,
    color: '#696969',
    paddingLeft: '4px',
    paddingRight: '4px',
    paddingBottom: '10px',
    borderBottom: '1px solid lightgrey',
  },
  icons: {
    width: '20px',
  },
  accordian: {
    maxWidth: '320px',
  },
  accordianDetails: {
  },
  accordionTitle: {
    width: '200px',
    textOverflow: 'ellipsis',
    overflowWrap: 'break-word',
  },
})
