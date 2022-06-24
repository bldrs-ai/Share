import {MockViewer, MockModel} from './IfcMock.test'
import {
  decodeIFCString,
  deref,
  getType,
  isTypeValue,
  reifyName,
} from './Ifc'


test('isTypeValue', () => {
  expect(isTypeValue({
    type: 1,
    value: 'foo',
  })).toBeTruthy()

  expect(isTypeValue({value: 'foo'})).toBeFalsy()
})


test('decodeIfcString', () => {
  const someAscii = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890'
  expect(someAscii).toEqual(decodeIFCString(someAscii))
  expect('Küche').toEqual(decodeIFCString('K\\X2\\00FC\\X0\\che'))
})


test('IfcManager.getType', () => {
  const elt = {
    children: [],
    expressID: 1,
    Name: 'Building',
  }
  expect(getType(new MockModel, elt)).toEqual('IFCELEMENT')
})


test('deref simple', async () => {
  const label = 'test val'
  expect(await deref(label)).toEqual(label)
})


test('deref array of simple', async () => {
  const label = 'test val'
  expect(await deref([label, label], new MockViewer, 0, (e) => e)).toEqual([label, label])
})


test('deref simple typeVal', async () => {
  const label = 'test label'
  const tv = {
    type: 1,
    value: label,
  }
  expect(isTypeValue(tv)).toBeTruthy()
  expect(await deref(tv, new MockViewer, 0, (e) => e)).toEqual(label)
})


test('deref reference typeVal', async () => {
  const label = 'test label'
  const tv = {
    type: 5,
    value: 0,
  }
  expect(isTypeValue(tv)).toBeTruthy()
  expect(await deref(tv, new MockModel({
    0: {
      type: 1,
      value: label,
    },
  }), 0, (e) => e.value)).toEqual(label)
})


test('reifyName with custom name', async () => {
  const name = 'Custom Element Name'
  const model = new MockModel({})
  const elt = {
    children: [],
    expressID: 1,
    Name: {
      type: 1,
      value: name,
    },
  }
  expect(await reifyName(model, elt)).toBe(name)
})

// TODO(pablo): unclear how
/*
test('reifyName with missing name', async () => {
  const elt = {
    children: [],
    expressID: 1,
    Name: {
      type: 103090709,
      value: null,
    },
  }
  const model = new MockModel({
    1: elt,
  })
  expect(await reifyName(model, elt)).toBe('IFCPROJECT')
})
*/
