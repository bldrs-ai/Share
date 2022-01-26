import {
  decodeIFCString,
  getType
} from './Ifc.js'


test('Test decode ifc string', () => {
  const someAscii = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890';
  expect(someAscii).toEqual(decodeIFCString(someAscii));
  expect('Küche').toEqual(decodeIFCString('K\\X2\\00FC\\X0\\che'));
});


test('ifc.js IfcManager.getType', () => {
  const elt = {
    children: [],
    expressID: 1,
    Name: 'Building'
  };
  expect(getType(elt, mockViewer)).toEqual('IFCELEMENT');
});


export const mockViewer = {
  IFC: {
    loader: {
      ifcManager: {
        getPropertySets: (modelId, expressId) => {
          return new Promise((resolve, reject) => {
            resolve([]);
          });
        },
        getIfcType: (elt, viewer) => 'IFCELEMENT'
      }
    }
  }
};


export function newMockStringValueElt(label, id = 1) {
  return {
    children: [],
    expressID: id,
    Name: {
      type: 1,
      value: label
    }
  }
}
