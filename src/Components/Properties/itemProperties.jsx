import React, {useState} from 'react'
import {Typography} from '@mui/material'
import {deref, decodeIFCString} from '@bldrs-ai/ifclib'
import debug from '../../utils/debug'
import {prettyType} from '../../utils/ifc'
import {stoi} from '../../utils/strings'


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
 * @param {number} [depth] how deep this table is nested inside another
 *   (see renderableValue)
 * @return {object} A property table react component
 */
export async function createPropertyTable(model, ifcProps, isPset = false, serial = 0, depth = 0) {
  const ROWS = []
  let rowKey = 0
  const typeName = entityTypeName(model, ifcProps)
  if (!isPset && typeName !== null && typeName !== 'IfcPropertySet') {
    // Prettified for reading ('Element (generic proxy)'), not the raw
    // schema constant ('IFCBUILDINGELEMENTPROXY').
    ROWS.push(<Row d1={'Type'} d2={prettyType(typeName)} key={`type-${serial}`}/>)
  }
  for (const key in ifcProps) {
    if (isPset && (key === 'expressID' || key === 'Name')) {
      continue
    }
    const val = ifcProps[key]
    const propRow = await prettyProps(model, key, val, false, rowKey++, depth)
    if (propRow) {
      if (propRow.key === null) {
        throw new Error(`Row for key=(${key}) created with invalid react key`)
      }
      ROWS.push(propRow)
    }
  }
  return (
    <table key={`table-${serial++}`} role="table" aria-label="Element properties">
      <tbody>{ROWS}</tbody>
    </table>
  )
}


/**
 * Display name for the entity's schema type, or null when no usable name
 * can be derived (the row is omitted rather than showing a junk value).
 *
 * Resolution order:
 *   1. `ifcProps.type` as a string — Conway's compat surface returns the
 *      entity type name directly ('ADVANCED_FACE', 'IFCWALL', …). This is
 *      the STEP path and the modern Conway-direct IFC path.
 *   2. Numeric `ifcProps.type` (an IFC type code from `getLine`-shaped
 *      surfaces) mapped through `model.ifcManager.getIfcType(0, code)`.
 *   3. `constructor.name` when it looks like a real IFC class (web-ifc
 *      dev builds return class instances like `IfcWall`). Minified prod
 *      builds mangle those names ('t') and plain objects give 'Object' —
 *      neither is a type, so both are rejected rather than displayed,
 *      which is the long-standing "IFC Type: Object" bug this replaces.
 *
 * @param {object} model IFC model (for the numeric type-code lookup)
 * @param {object} ifcProps the entity
 * @return {string|null}
 */
export function entityTypeName(model, ifcProps) {
  const rawType = ifcProps?.type
  if (typeof rawType === 'string' && rawType.length > 0) {
    return rawType
  }
  if (typeof rawType === 'number') {
    // Two manager shapes exist: ShareIfcManager's `getIfcType(modelID,
    // typeCode)` and the Conway-direct shim, which lacks it but exposes
    // the compat surface's `properties.getIfcType(typeCode)` directly.
    const lookups = [
      () => model?.ifcManager?.getIfcType?.(0, rawType),
      () => model?.ifcManager?.ifcAPI?.properties?.getIfcType?.(rawType),
    ]
    for (const lookup of lookups) {
      try {
        const name = lookup()
        if (typeof name === 'string' && name.length > 0) {
          return name
        }
      } catch {
        // Try the next shape, then the constructor heuristic.
      }
    }
  }
  const ctorName = ifcProps?.constructor?.name
  if (typeof ctorName === 'string' && ctorName.startsWith('Ifc')) {
    return ctorName
  }
  return null
}


/**
 * The object `deref` needs to resolve a type-5 entity reference. Its
 * second parameter is a **web-ifc API**, not our model: it calls
 * `webIfc.properties.getItemProperties(...)`. Passing the model meant
 * that call threw on `undefined.getItemProperties` the moment a
 * property carried a reference — which aborted the whole table and left
 * the previously selected element's properties on screen. Spatial
 * containers (IfcSite, IfcBuilding) hit it; leaves mostly don't, which
 * is why this hid for so long.
 *
 * @param {object} model IFC model
 * @return {object} web-ifc-shaped API, falling back to the model so
 *   backends that already expose `properties` keep working.
 */
function webIfcFor(model) {
  return model?.ifcManager?.ifcAPI ?? model
}


/**
 * How deep nested entities render as their own tables before they are shown
 * as `#id TYPE` instead. A reference chain can be long (an IfcGrid's axis →
 * its IfcPolyline → its points), and each level is a table in a 130 px cell.
 */
const MAX_NESTED_TABLE_DEPTH = 2


/**
 * A deref'd property value as something React can render, whatever shape it
 * came back in: a string or number as is; an entity (an object with
 * `expressID`) as a nested table, or past MAX_NESTED_TABLE_DEPTH as its
 * `#id TYPE`; an array member by member; any other object as compact JSON.
 * Never a raw object, which is what React throws on (#31) and what took the
 * whole page down from one property (Share#2063).
 *
 * @param {object} model IFC model
 * @param {*} value deref's result
 * @param {number} serial react key base
 * @param {number} [depth] nesting depth so far
 * @return {Promise<*>} a React node
 */
export async function renderableValue(model, value, serial, depth = 0) {
  if (value === null || value === undefined) {
    return ''
  }
  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'bigint') {
    return value
  }
  if (type === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    const parts = []
    for (let i = 0; i < value.length; i++) {
      const part = await renderableValue(model, value[i], `${serial}-${i}`, depth)
      parts.push(<span key={`${serial}-${i}`}>{i > 0 ? ', ' : ''}{part}</span>)
    }
    return parts
  }
  if (type === 'object') {
    if (value.expressID !== undefined) {
      if (depth >= MAX_NESTED_TABLE_DEPTH) {
        const name = entityTypeName(model, value)
        return `#${value.expressID}${name ? ` ${prettyType(name)}` : ''}`
      }
      return await createPropertyTable(model, value, false, serial, depth + 1)
    }
    if (value.ref !== undefined) {
      // deref's shape for a reference to a rooted entity: {type, ref: GlobalId}.
      return String(value.ref)
    }
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}


/**
 * A copy for deref to rewrite in place. structuredClone where there is one;
 * values that will not clone (none are expected from either engine) are used
 * as they are.
 *
 * @param {*} value
 * @return {*}
 */
function cloneForDeref(value) {
  if (value === null || typeof value !== 'object' || typeof structuredClone !== 'function') {
    return value
  }
  try {
    return structuredClone(value)
  } catch {
    return value
  }
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
 * @param {number} [depth] nesting depth of the table this row is in
 * @return {object}
 */
async function prettyProps(model, propName, propValue, isPset, serial = 0, depth = 0) {
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
      // `deref` takes (ref, webIfc, indent) — the 4th "render nested
      // entity" callback this used to pass was never invoked, so a
      // resolved reference came back as a raw entity object and React
      // threw "Objects are not valid as a React child", aborting the
      // table. Every resolved value now goes through renderableValue,
      // which nests an entity into its own table — including an entity
      // INSIDE an array: an IfcGrid's UAxes / VAxes are references to
      // IfcGridAxis entities, which have no GlobalId, so deref resolves
      // each to a whole object, and rendering that array as React children
      // took down the whole app (React #31; the PSB grid, Share#2063).
      //
      // `structuredClone` first: deref rewrites the value IN PLACE, and the
      // record can be shared (a main-thread engine's cached object, or the
      // spatial-tree node the panel falls back to), so a second render of
      // the same element would otherwise start from already-resolved
      // objects.
      const derefed = await deref(cloneForDeref(propValue), webIfcFor(model), serial)
      return (
        <Row
          d1={label}
          d2={await renderableValue(model, derefed, serial, depth)}
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
    // Same shape, same guard as hasProperties below: a resolved quantity with
    // no Name is a row we can't label, and reading through the missing Name
    // is what crashed the panel (SHARE-1P3). Drop the one quantity, not the
    // whole table.
    if (ifcElt?.Name?.value === undefined) {
      debug().warn('quantities: skipping quantity with no Name: ', ifcElt)
      return
    }
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
          // A reference the model can't resolve yields undefined, and the
          // row callbacks all dereference `.Name.value` — that TypeError
          // took down the whole Properties panel rather than costing one
          // row (SHARE-1P3). Skip the entry and keep building the table.
          if (ifcElt === undefined || ifcElt === null) {
            debug().warn(`unpackHelper: unresolved property reference #${refId}`)
            continue
          }
          ifcToRowCb(ifcElt, rows)
        } else {
          debug().warn('model has no getProperties method: ', model)
        }
      }
    }
    return (
      <tr key={`hasProps-${serial++}`}>
        <td colSpan={2} style={{borderBottom: 'none'}}>
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
    // A pset entry that resolved to something without a Name is not a row we
    // can label — and reading through the missing Name is what crashed the
    // panel (SHARE-1P3). Drop this one property, not the whole table.
    if (dObj?.Name?.value === undefined) {
      debug().warn('hasProperties: skipping property with no Name: ', dObj)
      return
    }
    const name = decodeIFCString(dObj.Name.value)
    const value = (dObj.NominalValue === undefined || dObj.NominalValue === null) ?
      '<error>' :
      decodeIFCString(dObj.NominalValue.value)
    rows.push(<Row d1={name} d2={value} key={serial++}/>)
  })
}


// TODO(pablo): make aria-compliant:
// - table role='table'
// - with td[id={`key-${d1}`}] ref'd by td[headers={`key-${d1}`}]
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
      <tr onDoubleClick={toggleActive} role='row' aria-expanded='true'>
        <td colSpan={2} role='cell'>
          <Typography variant='propTitle' sx={{display: 'block'}}>{d1}</Typography>
          <Typography variant='propValue'>{d2}</Typography>
        </td>
      </tr>
    ) : (
      <tr onDoubleClick={toggleActive} role='row' aria-expanded='false'>
        <td style={rowStyleInactive} role='cell' aria-label={`Property: ${d1}`}>
          <Typography variant='propTitle'>{d1}</Typography>
        </td>
        <td style={rowStyleInactive} role='cell' aria-label={`Value: ${d2}`}>
          <Typography variant='propValue'>{d2}</Typography>
        </td>
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
