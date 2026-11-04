import React, {useState} from 'react'
import {Typography} from '@mui/material'
import debug from '../../utils/debug'
import {prettyType} from '../../utils/ifc'
import {
  Node,
  hasProperties as resolveHasProperties,
  moreText,
  quantities as resolveQuantities,
  resolvePropertyTables,
  resolveValue,
  typeNameOf,
} from './propertyTable'


export {MAX_ARRAY_MEMBERS, MAX_NESTED_TABLE_DEPTH} from './propertyTable'


/**
 * A property table for one entity, as a React component. Resolved by
 * propertyTable.js (in the model's engine worker when it has one, one
 * request for the whole table; on this thread otherwise), then rendered
 * here.
 *
 * @param {object} model IFC model
 * @param {object} ifcProps the entity
 * @param {boolean} [isPset] a property set
 * @param {number} [serial] react key base
 * @return {Promise<object>} A property table react component
 */
export async function createPropertyTable(model, ifcProps, isPset = false, serial = 0) {
  const [table] = await resolveTables(model, [{record: ifcProps, isPset}])
  return renderTable(table, serial)
}


/**
 * Several tables in one resolve: the panel's property sets, which under the
 * engine worker are one request for all of them rather than one per set (and
 * one per property in each).
 *
 * @param {object} model IFC model
 * @param {Array<object>} entries `{record, isPset}` each
 * @return {Promise<Array<object>>} property table react components, in order
 */
export async function createPropertyTables(model, entries) {
  const tables = await resolveTables(model, entries)
  return tables.map((table, i) => renderTable(table, i))
}


/**
 * Resolve tables where the model's reads are. A model whose engine is an
 * engine session (`?feature=engineWorker`, EngineSession.js#propertiesApi)
 * offers `properties.resolvePropertyTables`, which runs propertyTable.js next
 * to the engine: one round trip, instead of one per reference (Share#2070).
 * Every other model is resolved here, by the same code over the model's own
 * reads.
 *
 * A record that will not cross to the worker (a DataCloneError, thrown by
 * postMessage before anything is sent) is resolved here instead, through the
 * same session's per-read requests: slower, never wrong. Any other failure is
 * the table's, as it would be here.
 *
 * @param {object} model
 * @param {Array<object>} entries `{record, isPset}` each
 * @return {Promise<Array<object>>} propertyTable.js `Node.TABLE`s
 */
async function resolveTables(model, entries) {
  if (entries.length === 0) {
    return []
  }
  const remote = webIfcFor(model)?.properties?.resolvePropertyTables
  if (typeof remote === 'function') {
    try {
      return await remote(0, entries)
    } catch (e) {
      if (e?.name !== 'DataCloneError') {
        throw e
      }
      debug().warn('itemProperties: record did not cross to the engine; resolving here', e)
    }
  }
  return await resolvePropertyTables(readerFor(model), entries)
}


/**
 * propertyTable.js's reads over a model on this thread. The engine handler
 * builds the same over its engine (engineHandler.js#tableReader), and for a
 * live model the two make the same engine calls.
 *
 * The model's own `getItemProperties` first, for references too. Every live
 * model has one that takes `recursive` and reads the model's own engine
 * (conwayDirectIfcLoader.js#attachConwayDirectModelMethods). A GLB cache
 * hit's answers from its BLDRS_element_properties records, and is the only
 * thing that can: its `ifcManager.ifcAPI` is the viewer's engine, which has
 * no model open, so resolving through it gave `null` for every reference
 * (Share#2066). The engine API is the fallback for a model with no read of
 * its own.
 *
 * @param {object} model
 * @return {object} a propertyTable.js PropertyReader
 */
function readerFor(model) {
  const hasOwnRead = typeof model?.getItemProperties === 'function'
  return {
    read: hasOwnRead ?
      (id, recursive) => model.getItemProperties(id, recursive) :
      (id, recursive) => webIfcFor(model).properties.getItemProperties(0, id, recursive),
    readMember: hasOwnRead ? (id) => model.getItemProperties(id) : null,
    typeLookups: typeLookupsFor(model),
  }
}


/**
 * Numeric type code → name, for propertyTable.js#typeNameOf. Two manager
 * shapes exist: ShareIfcManager's `getIfcType(modelID, typeCode)` and the
 * Conway-direct shim, which lacks it but exposes the compat surface's
 * `properties.getIfcType(typeCode)` directly (an engine session's is
 * conway's static IfcTypesMap).
 *
 * @param {object} model
 * @return {Array<function(number): string>}
 */
function typeLookupsFor(model) {
  return [
    (code) => model?.ifcManager?.getIfcType?.(0, code),
    (code) => model?.ifcManager?.ifcAPI?.properties?.getIfcType?.(code),
  ]
}


/**
 * Display name for the entity's schema type, or null when no usable name
 * can be derived. See propertyTable.js#typeNameOf for the resolution order.
 *
 * @param {object} model IFC model (for the numeric type-code lookup)
 * @param {object} ifcProps the entity
 * @return {string|null}
 */
export function entityTypeName(model, ifcProps) {
  return typeNameOf(ifcProps, typeLookupsFor(model))
}


/**
 * The model's engine API: where an engine session's `resolvePropertyTables`
 * is found, and readerFor's fallback read.
 *
 * @param {object} model IFC model
 * @return {object} web-ifc-shaped API, falling back to the model so
 *   backends that already expose `properties` keep working.
 */
function webIfcFor(model) {
  return model?.ifcManager?.ifcAPI ?? model
}


/**
 * A resolved property value as something React can render (see
 * propertyTable.js#resolveValue), resolved on this thread.
 *
 * @param {object} model IFC model
 * @param {*} value an already-resolved value
 * @param {number} serial react key base
 * @param {number} [depth] nesting depth so far
 * @return {Promise<*>} a React node
 */
export async function renderableValue(model, value, serial, depth = 0) {
  return renderValue(await resolveValue(readerFor(model), value, depth), serial)
}


/**
 * @param {object} model IFC model
 * @param {object} quantitiesObj Quantities element
 * @param {number} serial
 * @return {Promise<object>} Table of quantities
 */
export async function quantities(model, quantitiesObj, serial) {
  return renderSubtable(await resolveQuantities(readerFor(model), quantitiesObj), serial)
}


/**
 * Convert a HasProperties to react component
 *
 * @param {object} model IFC model
 * @param {Array} hasPropertiesArr Array of HasProperties elements
 * @param {number} serial
 * @return {Promise<object>} Table rows for given hasPropertiesArr
 */
export async function hasProperties(model, hasPropertiesArr, serial) {
  return renderSubtable(await resolveHasProperties(readerFor(model), hasPropertiesArr), serial)
}


/**
 * @param {object} table a propertyTable.js `Node.TABLE`
 * @param {number} serial react key base
 * @return {object} the table
 */
function renderTable(table, serial) {
  const rows = []
  if (table.typeName !== null) {
    // Prettified for reading ('Element (generic proxy)'), not the raw
    // schema constant ('IFCBUILDINGELEMENTPROXY').
    rows.push(<Row d1={'Type'} d2={prettyType(table.typeName)} key={`type-${serial}`}/>)
  }
  table.rows.forEach((row, i) => {
    rows.push(row.k === Node.SUBTABLE ?
      renderSubtable(row, i) :
      <Row d1={row.label} d2={renderValue(row.value, `${serial}-${i}`)} key={i}/>)
  })
  return (
    <table key={`table-${serial}`} role="table" aria-label="Element properties">
      <tbody>{rows}</tbody>
    </table>
  )
}


/**
 * HasProperties / Quantities: label-value rows in one full-width cell.
 *
 * @param {object|null} subtable a propertyTable.js `Node.SUBTABLE`
 * @param {number} serial
 * @return {object|null}
 */
function renderSubtable(subtable, serial) {
  if (subtable === null) {
    return null
  }
  return (
    <tr key={`hasProps-${serial}`}>
      <td colSpan={2} style={{borderBottom: 'none'}}>
        <table>
          <tbody>{subtable.rows.map((row, i) => <Row d1={row.label} d2={row.value} key={i}/>)}</tbody>
        </table>
      </td>
    </tr>
  )
}


/**
 * @param {*} value a propertyTable.js value: a string, number or node
 * @param {string|number} serial react key base
 * @return {*} a React node
 */
function renderValue(value, serial) {
  if (value === null || typeof value !== 'object') {
    return value
  }
  switch (value.k) {
    case Node.TABLE: return renderTable(value, serial)
    case Node.ENTITY: return `#${value.id}${value.typeName ? ` ${prettyType(value.typeName)}` : ''}`
    case Node.REF: {
      const name = value.typeName === null ? '' : prettyType(value.typeName)
      return name ? `${name} ${value.ref}` : value.ref
    }
    case Node.LIST: {
      const parts = value.items.map((item, i) => (
        <span key={`${serial}-${i}`}>{i > 0 ? ', ' : ''}{renderValue(item, `${serial}-${i}`)}</span>
      ))
      if (value.more > 0) {
        parts.push(<span key={`${serial}-more`}>, {moreText(value.more)}</span>)
      }
      return parts
    }
    default:
      // Not a node propertyTable.js makes; never a raw object to React (#31).
      return String(value)
  }
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

