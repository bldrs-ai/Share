import React, {useState} from 'react'
import debug from './debug'
import Typography from '@mui/material/Typography'
import {deref, decodeIFCString} from '@bldrs-ai/ifclib'
import {stoi} from './strings'


/**
 * Recursive display of tables.  The recursion is:
 *
 * createPropertyTable -> prettyProps -> createPropertyTable
 *
 * @param {object} model IFC model
 * @param {object} ifcProps Caller should pass the root IFC element.
 * Recursive calls will pass children
 * @param {boolean} isPset Is property set
 * @param {number} serial
 * @return {object} A property table react component
 */
export async function createPropertyTable(model, ifcProps, isPset = false, serial = 0) {
  const ROWS = []
  let rowKey = 0
  if (ifcProps.constructor &&
      ifcProps.constructor.name &&
      ifcProps.constructor.name !== 'IfcPropertySet') {
    ROWS.push(<Row d1={'IFC Type'} d2={ifcProps.constructor.name} key={`type-${serial}`}/>)
  }
  for (const key in ifcProps) {
    if (isPset && (key === 'expressID' || key === 'Name')) {
      continue
    }
    const val = ifcProps[key]
    const propRow = await prettyProps(model, key, val, false, rowKey++ )
    if (propRow) {
      if (propRow.key === null) {
        throw new Error(`Row for key=(${key}) created with invalid react key`)
      }
      ROWS.push(propRow)
    }
  }
  return (
    <table key={`table-${serial++}`} >
      <tbody>{ROWS}</tbody>
    </table>
  )
}


/**
 * The keys are defined here:
 * https://standards.buildingsmart.org/IFC/DEV/IFC4_3/RC2/HTML/schema/ifcproductextension/lexical/ifcelement.htm
 *
 * @param {object} model IFC model
 * @param {string} propName Property name
 * @param {object | string} propValue Property value
 * @param {boolean} isPset
 * @param {number} serial
 * @return {object}
 */
async function prettyProps(model, propName, propValue, isPset, serial = 0) {
  let label = `${propName}`
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
    case 'RefLongitude': return (
      <Row
        d1={label}
        d2={
          dms(
              await deref(propValue[0]),
              await deref(propValue[1]),
              await deref(propValue[2]))
        }
        key={serial}
      />
    )
    case 'expressID': return <Row d1={'Express Id'} d2={propValue} key={serial}/>
    case 'Quantities': return await quantities(model, propValue, serial)
    case 'HasProperties': return await hasProperties(model, propValue, serial)
    default: {
      // Not sure where else to put this.. but seems better than handling in deref.
      if (propValue.type === 0) {
        return null
      }
      return (
        <Row
          d1={label}
          d2={
            await deref(
                propValue, model, serial,
                async (v, mdl, srl) => await createPropertyTable(mdl, v, srl))
          }
          key={serial}
        />
      )
    }
  }
}


/**
 * @param {object} model IFC model
 * @param {object} quantitiesObj Quantities element
 * @param {number} serial
 * @return {object} Table of quantities
 */
export async function quantities(model, quantitiesObj, serial) {
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
    rows.push(<Row d1={name} d2={val} key={serial++}/>)
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
export async function unpackHelper(model, eltArr, serial, ifcToRowCb) {
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
      <tr key={`hasProps-${serial++}`}>
        <td colSpan={2}>
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
 * @param {object} model IFC model
 * @param {Array} hasPropertiesArr Array of HasProperties elements
 * @param {number} serial
 * @return {object} Table rows for given hasPropertiesArr
 */
export async function hasProperties(model, hasPropertiesArr, serial) {
  if (!Array.isArray(hasPropertiesArr)) {
    throw new Error('hasPropertiesArr should be array')
  }
  return await unpackHelper(model, hasPropertiesArr, serial, (dObj, rows) => {
    const name = decodeIFCString(dObj.Name.value)
    const value = (dObj.NominalValue === undefined || dObj.NominalValue === null) ?
      '<error>' :
      decodeIFCString(dObj.NominalValue.value)
    rows.push(<Row d1={name} d2={value} key={serial++}/>)
  })
}


/**
 * HTML table row
 *
 * @param {object} d1 Table cell data 1
 * @param {object} d2 Table cell data 2
 * @param {number} serial
 * @return {object} The react component
 */
function Row({d1, d2}) {
  const [isActive, setIsActive] = useState(false)
  const toggleActive = () => {
    setIsActive(!isActive)
  }
  const rowStyleInactive = {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }
  if (d1 === null || d1 === undefined || d2 === undefined) {
    debug().warn('Row with invalid data: ', d1, d2)
  }
  if (d2 === null) {
    return <tr onDoubleClick={toggleActive}><td colSpan='2'>{d1}</td></tr>
  }
  return (
    isActive ? (
      <tr onDoubleClick={toggleActive}>
        <td colSpan={2}>
          <Typography variant='propTitle' sx={{display: 'block'}}>{d1}</Typography>
          <Typography variant='propValue'>{d2}</Typography>
        </td>
      </tr>
    ) : (
      <tr onDoubleClick={toggleActive}>
        <td style={rowStyleInactive}><Typography variant='propTitle'>{d1}</Typography></td>
        <td style={rowStyleInactive}><Typography variant='propValue'>{d2}</Typography></td>
      </tr>
    )
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
