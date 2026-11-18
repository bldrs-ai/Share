/**
 * Reading the quantities an IFC model carries, and the units they are in,
 * for `model.quantities` (assist-310, #1674).
 *
 * Everything reads through the model's ASYNC property API
 * (`getItemProperties` / `getPropertySets`), the surface that exists whether
 * the Conway engine runs on the main thread or in a worker
 * (engine-worker.md §11): no synchronous heap reads, one round trip per
 * entity.
 *
 * Quantity values are in the model's own units — `IfcProject.UnitsInContext`,
 * an `IfcUnitAssignment` — not metres, so they are converted here to SI
 * (m, m², m³, kg, s) and the result says so. A quantity may name its own
 * `Unit`, which overrides the project's.
 */

// IFC's STEP entity-reference wrapper (`{type: 5, value: <id>}`).
const IFC_REF_TYPE = 5

// The IfcPhysicalSimpleQuantity subtypes, told apart by the value attribute
// each one holds: the kind it is reported as, and the project unit type it is
// expressed in.
//
// By attribute, not by entity type, on purpose: the property API returns
// `type` as a numeric type code (`1883228015`), not a name, so a check on
// the entity's type string matches in a unit-test double and never on a real
// model. The attribute that is present is the same either way.
const QUANTITY_KINDS = [
  {key: 'LengthValue', kind: 'length', unitType: 'LENGTHUNIT'},
  {key: 'AreaValue', kind: 'area', unitType: 'AREAUNIT'},
  {key: 'VolumeValue', kind: 'volume', unitType: 'VOLUMEUNIT'},
  {key: 'CountValue', kind: 'count', unitType: null},
  {key: 'WeightValue', kind: 'weight', unitType: 'MASSUNIT'},
  {key: 'TimeValue', kind: 'time', unitType: 'TIMEUNIT'},
]

/** Reported unit symbol per kind, after conversion to SI. */
export const SI_SYMBOL = {length: 'm', area: 'm²', volume: 'm³', count: '', weight: 'kg', time: 's'}
export const QUANTITY_KIND_NAMES = Object.keys(SI_SYMBOL)

// SI prefix exponents (IfcSIPrefix).
const PREFIX_EXPONENT = {
  EXA: 18, PETA: 15, TERA: 12, GIGA: 9, MEGA: 6, KILO: 3, HECTO: 2, DECA: 1,
  DECI: -1, CENTI: -2, MILLI: -3, MICRO: -6, NANO: -9, PICO: -12, FEMTO: -15, ATTO: -18,
}
// What one of an SI unit name is, in the base unit the result reports
// (kg for mass, so GRAM is 1e-3).
const SI_NAME_BASE = {
  METRE: 1, SQUARE_METRE: 1, CUBIC_METRE: 1, GRAM: 1e-3, SECOND: 1,
}
// A prefix scales the unit it is attached to, so it is raised to that unit's
// power: a MILLI square metre is (10^-3)^2 = 10^-6 m², not 10^-3.
const SI_NAME_POWER = {SQUARE_METRE: 2, CUBIC_METRE: 3}
const MAX_UNIT_READS = 40
const BASE = 10


/**
 * @param {*} wrapped an attribute as the property API returns it
 * @return {*} its value, unwrapping `{type, value}` and an enum's dots
 */
export function unwrap(wrapped) {
  const raw = wrapped !== null && typeof wrapped === 'object' && 'value' in wrapped ? wrapped.value : wrapped
  return typeof raw === 'string' ? raw.replace(/^\.|\.$/g, '') : raw
}


/**
 * @param {*} handle an attribute that should be an entity reference
 * @return {number|null} its express id
 */
function refId(handle) {
  const id = Number(handle?.value)
  return handle?.type === IFC_REF_TYPE && Number.isFinite(id) ? id : null
}


/**
 * The SI unit an `IfcSIUnit` entity states, found by what its enumerations
 * ARE rather than by the attribute they are filed under.
 *
 * Conway files an `IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)`'s values one
 * attribute early — `Dimensions` = LENGTHUNIT, `UnitType` = MILLI, `Prefix` =
 * METRE, `Name` absent — because the leading `*` (the derived Dimensions) takes
 * no slot in its attribute list. Reading `Name` and `Prefix` by name then
 * finds nothing on a real model. The values themselves are unambiguous
 * (a prefix is never a unit name, a unit type always ends in UNIT), so they
 * are sorted by kind, which reads both the shifted layout and a corrected one.
 *
 * @param {object} unit the entity
 * @return {{unitType: ?string, prefix: ?string, name: ?string}}
 */
function siUnitFields(unit) {
  const fields = {unitType: null, prefix: null, name: null}
  for (const key of ['Dimensions', 'UnitType', 'Prefix', 'Name']) {
    const value = unwrap(unit?.[key])
    if (typeof value !== 'string') {
      continue
    }
    if (PREFIX_EXPONENT[value] !== undefined) {
      fields.prefix = value
    } else if (SI_NAME_BASE[value] !== undefined) {
      fields.name = value
    } else if (value.endsWith('UNIT')) {
      fields.unitType = value
    }
  }
  return fields
}


/**
 * @param {object} unit a unit entity
 * @return {?string} its UNITTYPE (LENGTHUNIT…), for either kind of unit
 */
function unitTypeOf(unit) {
  if (unit?.ConversionFactor !== undefined) {
    return unwrap(unit.UnitType) ?? null
  }
  return siUnitFields(unit).unitType
}


/**
 * Factor from one entity's unit to the SI base unit, for the unit entities
 * an `IfcUnitAssignment` holds. Told apart by shape (see
 * {@link QUANTITY_KINDS}): a `ConversionFactor` makes it an
 * `IfcConversionBasedUnit`, else it is read as an `IfcSIUnit`.
 *
 * @param {object} model the model's async property API
 * @param {number} id the unit entity
 * @param {{reads: number}} budget bounds the entity reads for one project
 * @return {Promise<number|null>} null when it can't be resolved
 */
async function unitFactor(model, id, budget) {
  if (budget.reads++ >= MAX_UNIT_READS) {
    return null
  }
  const unit = await model.getItemProperties(id)
  if (unit?.ConversionFactor !== undefined) {
    // ConversionFactor is an IfcMeasureWithUnit: a value in another unit.
    const measureId = refId(unit.ConversionFactor)
    const measure = measureId === null ? null : await model.getItemProperties(measureId)
    const value = Number(unwrap(measure?.ValueComponent))
    const inner = refId(measure?.UnitComponent)
    const innerFactor = inner === null ? null : await unitFactor(model, inner, budget)
    return Number.isFinite(value) && innerFactor !== null ? value * innerFactor : null
  }
  const {prefix, name} = siUnitFields(unit)
  if (name === null) {
    // IfcDerivedUnit, IfcContextDependentUnit, IfcMonetaryUnit: not
    // convertible to SI with a factor.
    return null
  }
  const prefixFactor = prefix ? BASE ** PREFIX_EXPONENT[prefix] : 1
  return SI_NAME_BASE[name] * (prefixFactor ** (SI_NAME_POWER[name] ?? 1))
}


/**
 * The project's units, as factors to SI.
 *
 * @param {object} model the model's async property API
 * @param {number|null} projectId the IfcProject's express id
 * @return {Promise<{factors: object, source: string, assumed: boolean}>}
 *   `factors[UNITTYPE]` → number; `assumed` when the assignment couldn't be
 *   read and SI base units are taken, which the result says
 */
export async function readProjectUnits(model, projectId) {
  const factors = {}
  const budget = {reads: 0}
  try {
    const project = projectId === null ? null : await model.getItemProperties(projectId)
    const assignmentId = refId(project?.UnitsInContext)
    const assignment = assignmentId === null ? null : await model.getItemProperties(assignmentId)
    for (const handle of assignment?.Units ?? []) {
      const id = refId(handle)
      if (id === null) {
        continue
      }
      const unit = await model.getItemProperties(id)
      const unitType = unitTypeOf(unit)
      if (typeof unitType === 'string' && factors[unitType] === undefined) {
        const factor = await unitFactor(model, id, budget)
        if (factor !== null) {
          factors[unitType] = factor
        }
      }
    }
    if (Object.keys(factors).length > 0) {
      // A model that states only a length unit has area and volume in its
      // powers (IFC says the area/volume unit then follows from it).
      if (factors.LENGTHUNIT !== undefined) {
        factors.AREAUNIT ??= factors.LENGTHUNIT ** 2
        factors.VOLUMEUNIT ??= factors.LENGTHUNIT ** 3
      }
      return {factors, source: 'the project\'s IfcUnitAssignment', assumed: false}
    }
  } catch {
    // Fall through to the assumption below.
  }
  return {factors: {}, source: 'assumed SI base units (no readable IfcUnitAssignment)', assumed: true}
}


/**
 * One element's quantities, across its `IfcElementQuantity` sets.
 *
 * @param {object} model the model's async property API
 * @param {number} id the element's express id
 * @param {object} units from {@link readProjectUnits}
 * @param {Map<number, number|null>} unitCache per-call cache of an
 *   explicit `Unit` reference's factor
 * @param {Function} checkAborted throws when the call was stopped
 * @return {Promise<Array<object>>} `{set, name, kind, value, unit}` in SI;
 *   a quantity name repeated across sets counts once (the first)
 */
export async function readElementQuantities(model, id, units, unitCache, checkAborted) {
  const sets = (await model.getPropertySets(id)) ?? []
  const quantities = []
  const seen = new Set()
  for (const set of sets) {
    // An IfcElementQuantity is the one set that lists `Quantities` (a property
    // set lists `HasProperties`).
    if (!Array.isArray(set?.Quantities)) {
      continue
    }
    const setName = unwrap(set.Name)
    for (const handle of set.Quantities ?? []) {
      checkAborted()
      // The API returns references; a build that resolves them hands the
      // entity itself.
      const quantityId = refId(handle)
      const entity = quantityId === null ? handle : await model.getItemProperties(quantityId)
      const spec = QUANTITY_KINDS.find(({key}) => entity?.[key] !== undefined && entity[key] !== null)
      const name = unwrap(entity?.Name)
      const raw = Number(unwrap(entity?.[spec?.key]))
      if (!spec || typeof name !== 'string' || !Number.isFinite(raw) || seen.has(`${name}|${spec.kind}`)) {
        continue
      }
      let factor = spec.unitType === null ? 1 : (units.factors[spec.unitType] ?? 1)
      const unitRef = refId(entity.Unit)
      if (unitRef !== null && spec.unitType !== null) {
        if (!unitCache.has(unitRef)) {
          unitCache.set(unitRef, await unitFactor(model, unitRef, {reads: 0}))
        }
        factor = unitCache.get(unitRef) ?? factor
      }
      seen.add(`${name}|${spec.kind}`)
      quantities.push({
        set: typeof setName === 'string' ? setName : '',
        name,
        kind: spec.kind,
        value: raw * factor,
        unit: SI_SYMBOL[spec.kind],
      })
    }
  }
  return quantities
}
