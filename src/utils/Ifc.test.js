import {MockViewer, newMockStringValueElt} from './IfcMock.test'
import {
  decodeIFCString,
  deref,
  getType,
  isTypeValue,
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
  expect(getType(elt, new MockViewer)).toEqual('IFCELEMENT')
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
  expect(await deref(tv, new MockViewer({
    0: {
      type: 1,
      value: label,
    },
  }), 0, (e) => e.value)).toEqual(label)
})
