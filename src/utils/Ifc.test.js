import {
  decodeIFCString,
} from './Ifc.js';


test('Test decode ifc string', () => {
  const someAscii = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890';
  expect(someAscii).toEqual(decodeIFCString(someAscii));
  expect('Küche').toEqual(decodeIFCString('K\\X2\\00FC\\X0\\che'));
});
