import React from 'react'
import {render, screen} from '@testing-library/react'
import {MockModel} from '../../utils/IfcMock.test'
import {hasProperties} from './itemProperties'


const REF_TYPE = 5


/**
 * `hasProperties` returns the `<tr>` wrapping the property table, so it needs
 * a table around it to be valid DOM.
 *
 * @param {object} row The element hasProperties resolved to
 */
function renderRow(row) {
  render(<table><tbody>{row}</tbody></table>)
}


/**
 * Regression cover for SHARE-1P3: one unresolvable reference inside a
 * property set threw a TypeError out of `dObj.Name.value` and took the whole
 * Properties panel down, rather than costing the one row it could not build.
 */
describe('hasProperties', () => {
  it('renders every property of a well-formed pset', async () => {
    const model = new MockModel({
      1: {Name: {value: 'Fire Rating'}, NominalValue: {value: 'F60'}},
      2: {Name: {value: 'Load Bearing'}, NominalValue: {value: 'True'}},
    })
    renderRow(await hasProperties(model, [
      {type: REF_TYPE, value: 1},
      {type: REF_TYPE, value: 2},
    ], 0))

    expect(screen.getByText('Fire Rating')).toBeInTheDocument()
    expect(screen.getByText('Load Bearing')).toBeInTheDocument()
  })

  it('skips a reference the model cannot resolve and keeps the rest', async () => {
    // Id 9 is absent from the model, so getItemProperties yields undefined.
    const model = new MockModel({
      1: {Name: {value: 'Fire Rating'}, NominalValue: {value: 'F60'}},
    })
    renderRow(await hasProperties(model, [
      {type: REF_TYPE, value: 9},
      {type: REF_TYPE, value: 1},
    ], 0))

    expect(screen.getByText('Fire Rating')).toBeInTheDocument()
    expect(screen.getByText('F60')).toBeInTheDocument()
  })

  it('skips a resolved property that carries no Name and keeps the rest', async () => {
    const model = new MockModel({
      1: {NominalValue: {value: 'orphan'}},
      2: {Name: {value: 'Fire Rating'}, NominalValue: {value: 'F60'}},
    })
    renderRow(await hasProperties(model, [
      {type: REF_TYPE, value: 1},
      {type: REF_TYPE, value: 2},
    ], 0))

    expect(screen.getByText('Fire Rating')).toBeInTheDocument()
    expect(screen.queryByText('orphan')).not.toBeInTheDocument()
  })

  it('still rejects a non-reference array, which is a different bug', async () => {
    const model = new MockModel({})
    await expect(hasProperties(model, [{type: 1, value: 'not a ref'}], 0))
      .rejects.toThrow('Array contains non-reference type')
  })
})
