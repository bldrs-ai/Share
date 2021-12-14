import Testing from '@pablo-mayrgundter/testing.js/testing.js';
import {
  decodeIFCString,
} from './Ifc.js';


const tests = new Testing();


tests.add('Test decode ifc string', () => {
  const someAscii = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890';
  tests.assertEquals(someAscii, decodeIFCString(someAscii));
  tests.assertEquals('Küche', decodeIFCString('K\\X2\\00FC\\X0\\che'));
});


tests.run();
