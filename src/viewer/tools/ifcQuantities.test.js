/* eslint-disable no-magic-numbers */
import {readProjectUnits} from './ifcQuantities'


const ref = (value) => ({type: 5, value})
const en = (value) => ({type: 3, value})


/**
 * A model whose property API serves a project with the given unit entities.
 *
 * @param {Array<object>} units entities, ids 10.. in order
 * @return {object} `{getItemProperties}`
 */
function modelWith(units) {
  const entities = {
    1: {expressID: 1, UnitsInContext: ref(2)},
    2: {expressID: 2, Units: units.map((_, i) => ref(10 + i))},
  }
  units.forEach((unit, i) => {
    entities[10 + i] = {expressID: 10 + i, type: 448429030, ...unit}
  })
  return {getItemProperties: (id) => Promise.resolve(entities[id] ?? null)}
}


// The IFC line each layout comes from, and what the property API returns for
// it. Conway shifts the fields one slot early (the leading `*` takes none).
describe('viewer/tools ifcQuantities#readProjectUnits', () => {
  // IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.), IFCSIUNIT(*,.AREAUNIT.,.MILLI.,.SQUARE_METRE.),
  // IFCSIUNIT(*,.VOLUMEUNIT.,.MILLI.,.CUBIC_METRE.)
  const shifted = [
    {Dimensions: en('LENGTHUNIT'), UnitType: en('MILLI'), Prefix: en('METRE')},
    {Dimensions: en('AREAUNIT'), UnitType: en('MILLI'), Prefix: en('SQUARE_METRE')},
    {Dimensions: en('VOLUMEUNIT'), UnitType: en('MILLI'), Prefix: en('CUBIC_METRE')},
  ]
  // The same entities as Conway >= 1.1651.790 returns them (conway#790).
  const corrected = [
    {Dimensions: {type: 0}, UnitType: en('LENGTHUNIT'), Prefix: en('MILLI'), Name: en('METRE')},
    {Dimensions: {type: 0}, UnitType: en('AREAUNIT'), Prefix: en('MILLI'), Name: en('SQUARE_METRE')},
    {Dimensions: {type: 0}, UnitType: en('VOLUMEUNIT'), Prefix: en('MILLI'), Name: en('CUBIC_METRE')},
  ]

  // The prefix scales the whole unit: milli square metre is (10^-3)^2 m².
  it.each([['shifted', shifted], ['corrected', corrected]])('raises a prefix to the unit\'s power (%s layout)', async (_, units) => {
    const {factors, assumed} = await readProjectUnits(modelWith(units), 1)
    expect(assumed).toBe(false)
    expect(factors.LENGTHUNIT).toBeCloseTo(1e-3, 12)
    expect(factors.AREAUNIT).toBeCloseTo(1e-6, 15)
    expect(factors.VOLUMEUNIT).toBeCloseTo(1e-9, 18)
  })

  it('reads an unprefixed metre set, and kilogram from KILO GRAM', async () => {
    const {factors} = await readProjectUnits(modelWith([
      {Dimensions: en('LENGTHUNIT'), UnitType: null, Prefix: en('METRE')},
      {Dimensions: en('AREAUNIT'), UnitType: null, Prefix: en('SQUARE_METRE')},
      {Dimensions: en('MASSUNIT'), UnitType: en('KILO'), Prefix: en('GRAM')},
    ]), 1)
    expect(factors.LENGTHUNIT).toBe(1)
    expect(factors.AREAUNIT).toBe(1)
    expect(factors.MASSUNIT).toBeCloseTo(1, 12)
  })
})
