// The Properties panel's tables as plain data: every engine read a table
// needs, done in one place, so that place can be inside the engine's worker
// (Share#2070, engine-worker.md §7.1).
//
// Under `?feature=engineWorker` each engine read is a worker round trip, and
// each reply waits behind a main-thread frame (127–217 ms headless, up to a
// frame on a GPU). The panel used to make one read per top-level reference
// (ifclib's `deref`) and one per property of each property set, so a 42-axis
// IfcGrid's table was 40+ sequential round trips. Resolving the table here
// instead makes it one request (the `propertyTables` op, engineHandler.js),
// and the reply holds only what the panel renders: past
// MAX_NESTED_TABLE_DEPTH an entity is its `#id TYPE`, past MAX_ARRAY_MEMBERS
// an array is `… and N more` (and its other members are never resolved), and
// an all-primitive array is already its joined string.
//
// The same code runs in all three places a table is built:
//   - in the engine worker, behind the `propertyTables` op;
//   - in the in-process engine (the worker's fallback), the same handler;
//   - on the main thread for every model whose reads are not an engine
//     session's (the main-thread engine, a GLB cache hit), called by
//     itemProperties.jsx with a reader over the model.
// itemProperties.jsx then renders the result. So the panel's output cannot
// depend on where its table was resolved: only the reader differs, and the
// worker's and the main-thread engine's make the same engine calls.
//
// Format-neutral: IFC and STEP records go through the same reads (conway's
// compat surface serves both), so a STEP element's table is one request too.
//
// Imported by Engine.worker.js, so it must stay off React, the DOM, the store
// and `utils/strings` (whose `location` import touches `window` at module
// scope). `debug` and conway's type map are worker-safe, and the type map is
// in the worker already. ifclib is not imported: its main entry brings
// json2csv and its own copy of the type map, 108 KB of worker bundle for the
// one function used here (decodeIFCString, copied below).
// Resolves via conway's `./src/*` export map; a few KB, no wasm glue.
import {IfcTypesMap} from '@bldrs-ai/conway/src/compat/web-ifc/types-map'
import debug from '../../utils/debug'


/**
 * How deep nested entities resolve to their own tables before they are given
 * as `#id TYPE` instead. A reference chain can be long (an IfcGrid's axis →
 * its IfcPolyline → its points), and each level is a table in a 130 px cell.
 *
 * A reference to an entity without a GlobalId is still read whole (one
 * recursive `getItemProperties`, which conway flattens inside the engine),
 * and the cut is made after it; a rooted one is read shallow, and nothing
 * under a key no table shows (a representation, a placement) is resolved
 * (derefValue). In the worker those reads are under 1 ms each; what this
 * bounds is what crosses back and what the panel builds.
 */
export const MAX_NESTED_TABLE_DEPTH = 2


/**
 * How many members of an array are shown before `… and N more`. Arrays the
 * panel can reach run to tens of thousands of members (an
 * IfcCartesianPointList3D's coordinates, a shell's faces), and each entity
 * member is a nested table. Members past it are not resolved either, so a
 * long list of references costs MAX_ARRAY_MEMBERS reads, not one per member.
 */
export const MAX_ARRAY_MEMBERS = 50


/**
 * The `k` of each node a resolved table is built from. Everything else in a
 * resolved table is a string or a number, rendered as is.
 */
export const Node = Object.freeze({
  // {k, typeName: string|null, rows}: a table; `typeName` is the Type row's
  // raw schema name, null when the row is omitted.
  TABLE: 'table',
  // {k, label, value}: one Row.
  ROW: 'row',
  // {k, rows: [{label, value}]}: HasProperties / Quantities, a table of
  // label-value rows inside one full-width cell.
  SUBTABLE: 'subtable',
  // {k, items, more}: an array with an entity or object member, shown member
  // by member; `more` members were cut (MAX_ARRAY_MEMBERS).
  LIST: 'list',
  // {k, id, typeName}: `#id TYPE`. An entity past MAX_NESTED_TABLE_DEPTH;
  // or, with a null typeName, a reference that resolved to nothing (not in
  // a GLB cache hit's records, Share#2066; dangling in the file) or back up
  // its own chain.
  ENTITY: 'entity',
  // {k, typeName, ref}: deref's `{type, ref: GlobalId}` for a reference to a
  // rooted entity.
  REF: 'ref',
})


// Step value types (ifclib's stepValueTypes.js, web-ifc's numbering, which
// conway's compat surface keeps).
const STRING = 1
const LABEL = 2
const ENUM = 3
const REAL = 4
const REF = 5


/**
 * Property names the panel does not show.
 */
const SKIPPED_PROPS = new Set([
  'type', 'CompositionType', 'GlobalId', 'ObjectPlacement', 'ObjectType', 'OwnerHistory',
  'PredefinedType', 'Representation', 'RepresentationContexts', 'Representations', 'Tag',
  'UnitsInContext',
])


/**
 * SKIPPED_PROPS that derefValue leaves unresolved on an entity. Not `type`,
 * which it maps to the schema name the Type row and `#id TYPE` show, nor
 * `GlobalId`, which decides whether a reference is shown by name
 * (derefReference).
 */
const UNRESOLVED_PROPS = new Set([...SKIPPED_PROPS].filter((key) => key !== 'type' && key !== 'GlobalId'))


/**
 * Property names whose value is shown as degrees, minutes and seconds.
 */
const DMS_PROPS = new Set(['Coordinates', 'RefLatitude', 'RefLongitude'])


/**
 * The reads a table needs. itemProperties.jsx#readerFor builds one over a
 * model, engineHandler.js one over its engine. The worker's and the
 * main-thread engine's make the same engine calls, which is what keeps the
 * panel's output independent of where it was resolved.
 *
 * @typedef {object} PropertyReader
 * @property {function(number, boolean): Promise<object>} read one entity by
 *   expressID; `recursive` asks the engine to inline what it references (a
 *   GLB cache hit's records are shallow, and ignore it). Resolves undefined or
 *   null for an entity it does not have.
 * @property {function(number): Promise<object>|null} readMember the
 *   non-recursive read HasProperties and Quantities resolve their members
 *   with; null when the model has none (those rows are then empty)
 * @property {Array<function(number): string>} typeLookups numeric type code →
 *   schema name, tried in order (see typeNameOf)
 */


/**
 * Resolve tables, in `entries` order. Concurrent, as the panel's property
 * sets always were; a failure in any one fails the call, as `Promise.all`
 * over the sets did.
 *
 * @param {PropertyReader} reader
 * @param {Array<object>} entries `{record, isPset}` each
 * @return {Promise<Array<object>>} `Node.TABLE`s
 */
export function resolvePropertyTables(reader, entries) {
  return Promise.all(entries.map(({record, isPset = false}) =>
    resolveTable(withTotals(reader), record, isPset === true, 0, false)))
}


/**
 * A resolve's own state beside its reader: the full length of every array
 * derefValue cut to MAX_ARRAY_MEMBERS, for `… and N more`.
 *
 * @param {PropertyReader} reader
 * @return {object}
 */
function withTotals(reader) {
  return {...reader, totals: new WeakMap()}
}


/**
 * One table. The recursion is resolveTable → resolveRow → resolveValue →
 * resolveTable.
 *
 * @param {object} reader a PropertyReader, with its resolve's `totals`
 * @param {object} ifcProps the entity
 * @param {boolean} isPset a property set: no Type, expressID or Name row
 * @param {number} depth how deep this table is nested inside another
 * @param {boolean} derefed whether `ifcProps` is already resolved: a nested
 *   entity, which came out of derefValue whole. Its values must NOT be
 *   resolved again: derefValue would rebuild every array it cut, and their
 *   full lengths are keyed on those arrays (`totals`), so `… and N more`
 *   would be lost. (The old renderer did deref a second time; on its values
 *   that was a no-op.)
 * @return {Promise<object>} a `Node.TABLE`
 */
async function resolveTable(reader, ifcProps, isPset, depth, derefed) {
  const typeName = typeNameOf(ifcProps, reader.typeLookups)
  const rows = []
  for (const key in ifcProps) {
    if (isPset && (key === 'expressID' || key === 'Name')) {
      continue
    }
    const row = await resolveRow(reader, key, ifcProps[key], depth, derefed)
    if (row) {
      rows.push(row)
    }
  }
  return {
    k: Node.TABLE,
    typeName: (!isPset && typeName !== null && typeName !== 'IfcPropertySet') ? typeName : null,
    rows,
  }
}


/**
 * The keys are defined here:
 * https://standards.buildingsmart.org/IFC/DEV/IFC4_3/RC2/HTML/schema/ifcproductextension/lexical/ifcelement.htm
 *
 * @param {object} reader a PropertyReader, with its resolve's `totals`
 * @param {string} propName
 * @param {*} propValue the engine's value, or derefValue's
 * @param {number} depth nesting depth of the table this row is in
 * @param {boolean} derefed see resolveTable
 * @return {Promise<object|null>} a `Node.ROW` or `Node.SUBTABLE`, or null for
 *   no row
 */
async function resolveRow(reader, propName, propValue, depth, derefed) {
  let label = `${propName}`
  const refPrefix = 'Ref'
  if (label.startsWith(refPrefix)) {
    label = label.substring(refPrefix.length)
  }
  if (propValue === null || propValue === undefined || propValue === '') {
    debug().warn(`prettyProps: skipping propName(${propName}) invalid propValue(${propValue})`)
    return null
  }
  if (SKIPPED_PROPS.has(propName)) {
    debug().warn('prettyProps, skipping prop for propName: ', propName)
    return null
  }
  if (DMS_PROPS.has(propName)) {
    // Numbers or simple step values, read without the engine (a reference
    // here throws, as ifclib's deref with no engine did). A nested
    // IfcCartesianPoint's Coordinates land here too.
    const deg = await derefValue(null, propValue[0], null)
    const min = await derefValue(null, propValue[1], null)
    const sec = await derefValue(null, propValue[2], null)
    return {k: Node.ROW, label, value: `${deg}° ${min}' ${sec}''`}
  }
  switch (propName) {
    case 'expressID': return {k: Node.ROW, label: 'Express Id', value: propValue}
    case 'Quantities': return await quantities(reader, propValue)
    case 'HasProperties': return await hasProperties(reader, propValue)
    default: {
      // Not sure where else to put this.. but seems better than handling in deref.
      if (propValue.type === 0) {
        return null
      }
      // Every resolved value goes through resolveValue, which nests an entity
      // into its own table, including an entity INSIDE an array: an IfcGrid's
      // UAxes / VAxes are references to IfcGridAxis entities, which have no
      // GlobalId, so they resolve to whole objects (Share#2063, where
      // rendering that array took down the app).
      const resolved = derefed ? propValue : await derefValue(reader, propValue, new Set())
      return {k: Node.ROW, label, value: await resolveValue(reader, resolved, depth)}
    }
  }
}


/**
 * A deref'd property value as a node the panel can render, whatever shape it
 * came back in: a string or number as is; an entity (an object with
 * `expressID`) as a nested table, or past MAX_NESTED_TABLE_DEPTH as its
 * `#id TYPE`; an array member by member; any other object as compact JSON.
 * Never a raw object, which is what React throws on (#31).
 *
 * @param {PropertyReader} reader
 * @param {*} value derefValue's result
 * @param {number} [depth] nesting depth so far
 * @return {Promise<*>} a string, number or node
 */
export async function resolveValue(reader, value, depth = 0) {
  if (value === null || value === undefined) {
    return ''
  }
  if (value.k === Node.ENTITY && value.expressID === undefined) {
    return value // unresolvedRef's
  }
  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'bigint') {
    return value
  }
  if (type === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    const shown = value.length > MAX_ARRAY_MEMBERS ? value.slice(0, MAX_ARRAY_MEMBERS) : value
    const more = (reader.totals?.get(value) ?? value.length) - shown.length
    if (shown.every(isPrimitive)) {
      // The common case (coordinates, indices, labels): one string, not a
      // node per member.
      const text = shown.map((member) => (member === null || member === undefined ? '' : String(member))).join(', ')
      return more > 0 ? `${text}, ${moreText(more)}` : text
    }
    const items = []
    for (const member of shown) {
      items.push(await resolveValue(reader, member, depth))
    }
    return {k: Node.LIST, items, more}
  }
  if (type === 'object') {
    if (value.expressID !== undefined) {
      if (depth >= MAX_NESTED_TABLE_DEPTH) {
        return {k: Node.ENTITY, id: value.expressID, typeName: typeNameOf(value, reader.typeLookups)}
      }
      return await resolveTable(reader, value, false, depth + 1, true)
    }
    if (value.ref !== undefined) {
      // deref's shape for a reference to a rooted entity: {type, ref:
      // GlobalId}, `type` already a name ('IFCWALL').
      return {k: Node.REF, typeName: typeof value.type === 'string' ? value.type : null, ref: String(value.ref)}
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
 * @param {number} more members cut
 * @return {string}
 */
export function moreText(more) {
  return `… and ${more} more`
}


/**
 * Display name for an entity's schema type, or null when no usable name can
 * be derived (the row is omitted rather than showing a junk value).
 *
 * Resolution order:
 *   1. `ifcProps.type` as a string — Conway's compat surface returns the
 *      entity type name directly ('ADVANCED_FACE', 'IFCWALL', …). This is
 *      the STEP path, and what derefValue leaves on every entity it resolved.
 *   2. Numeric `ifcProps.type` (an IFC type code from `getLine`-shaped
 *      surfaces) mapped through `typeLookups`, in order.
 *   3. `constructor.name` when it looks like a real IFC class (conway's
 *      compat records are class instances like `IfcWall`). Minified prod
 *      builds mangle those names ('t') and plain objects give 'Object' —
 *      neither is a type, so both are rejected rather than displayed,
 *      which is the long-standing "IFC Type: Object" bug this replaces.
 *
 * @param {object} ifcProps the entity
 * @param {Array<function(number): string>} [typeLookups]
 * @return {string|null}
 */
export function typeNameOf(ifcProps, typeLookups = []) {
  const rawType = ifcProps?.type
  if (typeof rawType === 'string' && rawType.length > 0) {
    return rawType
  }
  if (typeof rawType === 'number') {
    for (const lookup of typeLookups) {
      try {
        const name = lookup(rawType)
        if (typeof name === 'string' && name.length > 0) {
          return name
        }
      } catch {
        // Try the next one, then the constructor heuristic.
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
 * @param {PropertyReader} reader
 * @param {object} quantitiesObj Quantities element
 * @return {Promise<object|null>} a `Node.SUBTABLE`
 */
export async function quantities(reader, quantitiesObj) {
  return await unpackHelper(reader, quantitiesObj, (ifcElt, rows) => {
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
    rows.push({label: name, value: decodeIFCString(val)})
  })
}


/**
 * @param {PropertyReader} reader
 * @param {Array} hasPropertiesArr Array of HasProperties elements
 * @return {Promise<object|null>} a `Node.SUBTABLE`
 */
export async function hasProperties(reader, hasPropertiesArr) {
  if (!Array.isArray(hasPropertiesArr)) {
    throw new Error('hasPropertiesArr should be array')
  }
  return await unpackHelper(reader, hasPropertiesArr, (dObj, rows) => {
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
    rows.push({label: name, value})
  })
}


/**
 * Resolve an array of references into label-value rows, one read each.
 *
 * @param {PropertyReader} reader
 * @param {Array} eltArr references
 * @param {function(object, Array): void} toRows adds the rows for one entity
 * @return {Promise<object|null>} a `Node.SUBTABLE`, or null for a value that
 *   is not an array
 */
async function unpackHelper(reader, eltArr, toRows) {
  if (!Array.isArray(eltArr)) {
    debug().warn('HasProperties with unknown structure: ', eltArr)
    return null
  }
  const rows = []
  for (const i in eltArr) {
    if (Object.prototype.hasOwnProperty.call(eltArr, i)) {
      const p = eltArr[i]
      if (p.type !== REF) {
        throw new Error('Array contains non-reference type')
      }
      const refId = toInt(p.value)
      if (reader.readMember) {
        const ifcElt = await reader.readMember(refId)
        // A reference the model can't resolve yields undefined, and the row
        // callbacks all dereference `.Name.value` — that TypeError took down
        // the whole Properties panel rather than costing one row
        // (SHARE-1P3). Skip the entry and keep building the table.
        if (ifcElt === undefined || ifcElt === null) {
          debug().warn(`unpackHelper: unresolved property reference #${refId}`)
          continue
        }
        toRows(ifcElt, rows)
      } else {
        debug().warn('model has no getProperties method')
      }
    }
  }
  return {k: Node.SUBTABLE, rows}
}


/**
 * A reference that resolved to nothing: the reader had no entity for it (a
 * GLB cache hit holds only the entities its spatial tree reaches, Share#2066;
 * or the file's reference dangles), or it points back up its own chain.
 * Shown as `#id`, where ifclib's deref gave the string 'null'. It is the
 * final `Node.ENTITY` node already, a plain object, so it means the same
 * after a structured clone.
 *
 * @param {number} id
 * @return {object}
 */
function unresolvedRef(id) {
  return {k: Node.ENTITY, id, typeName: null}
}


/**
 * Recursive dereference of nested step values. ifclib's `deref` (Ifc.js),
 * which the panel used before, with these changes:
 *   - reads go through the PropertyReader, so a GLB cache hit resolves
 *     against its own records rather than the viewer's engine, which has no
 *     model open (Share#2066);
 *   - an unresolved reference, or one back up its own chain (`path`), is a
 *     `#id` node (unresolvedRef) rather than the string 'null' or a loop;
 *   - it builds its result instead of rewriting `ref` in place, so nothing it
 *     is given is ever changed or needs copying first. A cache hit's reader
 *     returns objects its LRU block cache shares (bldrsElementProperties.js),
 *     and the spatial-tree node Properties.jsx can fall back to is the
 *     NavTree's own;
 *   - an array is cut to MAX_ARRAY_MEMBERS before its members are resolved,
 *     its full length kept in `reader.totals` against the new array: the
 *     rest never render, and are never read or copied;
 *   - on an entity, the keys no table shows (UNRESOLVED_PROPS) are left as
 *     they are, and a reference to a rooted entity is resolved from a shallow
 *     read (derefReference).
 * Everything else is ifclib's, kept so the panel shows what it showed:
 * 'null' for a missing value, a typed value as its value (strings decoded),
 * an entity's `type` as its schema name and its `GlobalId` as the bare
 * string, and a reference to an entity with a GlobalId as `{type, ref}`.
 *
 * @param {object|null} reader a PropertyReader with `totals`; null to resolve
 *   only plain values (a reference then throws)
 * @param {*} ref the value
 * @param {Set<number>|null} path expressIDs being resolved, outermost first
 * @return {Promise<*>}
 */
async function derefValue(reader, ref, path) {
  if (ref === null || ref === undefined) {
    return 'null'
  }
  if (Array.isArray(ref)) {
    const cut = ref.length > MAX_ARRAY_MEMBERS && reader !== null
    const shown = cut ? ref.slice(0, MAX_ARRAY_MEMBERS) : ref
    const out = new Array(shown.length)
    for (let i = 0; i < shown.length; i++) {
      out[i] = await derefValue(reader, shown[i], path)
    }
    if (cut) {
      reader.totals.set(out, ref.length)
    }
    return out
  }
  if (typeof ref !== 'object') {
    return ref // number or string, e.g. the value of Name or expressID
  }
  if (isTypeValue(ref)) {
    switch (ref.type) {
      case STRING: return decodeIFCString(ref.value)
      case LABEL: return ref.value
      case ENUM: return ref.value // values are typically in CAPS
      case REAL: return ref.value
      case REF: {
        if (reader === null) {
          throw new TypeError('reference with no reader')
        }
        return await derefReference(reader, toInt(ref.value), path)
      }
      default:
        throw new Error(`Unknown reference type: ${ref}`)
    }
  }
  const isEntity = ref.expressID !== undefined
  const out = {}
  for (const key in ref) {
    if (!Object.prototype.hasOwnProperty.call(ref, key)) {
      continue
    }
    const val = ref[key]
    if (key === 'type') {
      out[key] = schemaTypeName(val)
    } else if (key === 'GlobalId' && val.type === STRING) {
      out[key] = val.value
    } else if (isEntity && UNRESOLVED_PROPS.has(key)) {
      // An entity renders as a table (resolveRow skips these keys at every
      // depth) or as `#id TYPE`, so these are never shown. Resolving them
      // read whole subgraphs to throw away: a product's Representation is
      // left as a handle by conway's recursive read, and resolving it read
      // the shape graph, thousands of records on PSB.
      out[key] = val
    } else {
      out[key] = await derefValue(reader, val, path)
    }
  }
  return out
}


/**
 * @param {object} reader
 * @param {number} id
 * @param {Set<number>} path
 * @return {Promise<*>} the entity, `{type, ref}` for a rooted one, or an
 *   unresolvedRef
 */
async function derefReference(reader, id, path) {
  if (path.has(id)) {
    return unresolvedRef(id)
  }
  // Shallow first. A rooted entity is named, not nested (it has its own row
  // in the tree), and ifclib returned `{type, ref}` for it only after
  // resolving its whole closure. Both are top-level fields, so the shallow
  // read is enough, and the closure is never read.
  const shallow = await reader.read(id, false)
  if (shallow === null || shallow === undefined) {
    return unresolvedRef(id)
  }
  if (shallow.GlobalId?.type === STRING && shallow.GlobalId.value) {
    return {type: schemaTypeName(shallow.type), ref: shallow.GlobalId.value}
  }
  const record = await reader.read(id, true)
  if (record === null || record === undefined) {
    return unresolvedRef(id)
  }
  path.add(id)
  let entity
  try {
    entity = await derefValue(reader, record, path)
  } finally {
    path.delete(id)
  }
  // A GlobalId of another shape, as ifclib tested it.
  if (entity.GlobalId) {
    return {type: entity.type, ref: entity.GlobalId}
  }
  return entity
}


/**
 * @param {object} obj
 * @return {boolean} whether `obj` is a step value `{type, value}`
 */
function isTypeValue(obj) {
  return obj.type !== undefined && obj.type !== null && obj.value !== undefined && obj.value !== null
}


/**
 * An IFC type code's schema name ('IFCWALL'), or the value itself when it is
 * not a known code (a name already, or a code no table has). Conway's
 * IfcTypesMap, which is the same table as ifclib's (both generated from
 * web-ifc 0.0.35, the same 816 codes) and the one an engine session's
 * `getIfcType` reads.
 *
 * @param {*} code
 * @return {*}
 */
export function schemaTypeName(code) {
  return Object.prototype.hasOwnProperty.call(IfcTypesMap, code) ? IfcTypesMap[code] : code
}


/**
 * ifclib's `decodeIFCString` (Ifc.js), copied rather than imported (see the
 * header): a step string's `\X2\…\X0\` escapes as the characters they
 * encode. https://github.com/tomvandig/web-ifc/issues/58#issuecomment-870344068
 *
 * @param {*} ifcString
 * @return {*} the decoded string; anything else as it was
 */
export function decodeIFCString(ifcString) {
  const ifcUnicodeRegEx = /\\X2\\(.*?)\\X0\\/uig
  let resultString = ifcString
  let match = ifcUnicodeRegEx.exec(ifcString)
  while (match) {
    const unicodeChar = String.fromCharCode(parseInt(match[1], 16))
    resultString = resultString.replace(match[0], unicodeChar)
    match = ifcUnicodeRegEx.exec(ifcString)
  }
  return resultString
}


/**
 * `utils/strings.js#stoi`, which this module cannot import (see the header).
 *
 * @param {*} s
 * @return {number}
 */
function toInt(s) {
  const i = parseInt(s)
  if (!isFinite(i)) {
    throw new Error(`Expected integer, got: ${s}`)
  }
  return i
}


/**
 * @param {*} value
 * @return {boolean} whether React renders it as text
 */
function isPrimitive(value) {
  return value === null || value === undefined || (typeof value !== 'object' && typeof value !== 'function')
}
