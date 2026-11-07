import {isFeatureEnabled} from '../FeatureFlags'
import {canOpenFromStore} from './Loader'


// Loader.js#canOpenFromStore after conway#757: conway says what its store
// open needs of the store for this file (IFC: any; STEP: one that reads
// synchronously), and the engine that will parse it says what it has. The
// engine worker's stores read synchronously; the main-thread engine's Blob
// store does not, and a refused store open there misaddresses the buffered
// retry (#1776), so a STEP buffers on the main thread and goes to the
// worker as a File.

jest.mock('../FeatureFlags', () => ({
  ...jest.requireActual('../FeatureFlags'),
  isFeatureEnabled: jest.fn(),
}))


/**
 * @param {string} schema FILE_SCHEMA value
 * @return {Blob} a minimal part-21 file declaring it
 */
function part21(schema) {
  return new Blob([`ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''),'2;1');
FILE_NAME('t','',(''),(''),'','','');
FILE_SCHEMA(('${schema}'));
ENDSEC;
DATA;
ENDSEC;
END-ISO-10303-21;
`])
}


/** @return {object} a viewer whose engine has the store open and a scene */
function viewer() {
  return {
    IFC: {
      loader: {ifcManager: {ifcAPI: {OpenModelStream: jest.fn()}}},
      context: {getScene: () => ({})},
    },
  }
}


/** @param {Array<string>} on the flags that are on */
function flags(on) {
  isFeatureEnabled.mockImplementation((name) => on.includes(name))
}


describe('Loader#canOpenFromStore', () => {
  it('an IFC takes the store open on either engine', async () => {
    flags(['demandGeometry'])
    expect(await canOpenFromStore(viewer(), 'ifc', part21('IFC4'))).toBe(true)
    flags(['demandGeometry', 'engineWorker'])
    expect(await canOpenFromStore(viewer(), 'ifc', part21('IFC4'))).toBe(true)
  })

  it('a STEP takes it in the engine worker, and buffers on the main-thread engine', async () => {
    flags(['demandGeometry', 'engineWorker'])
    expect(await canOpenFromStore(viewer(), 'step', part21('AUTOMOTIVE_DESIGN'))).toBe(true)
    // An AP203 / AP242 file opens through the same engine, with the same need.
    expect(await canOpenFromStore(viewer(), 'stp', part21('CONFIG_CONTROL_DESIGN'))).toBe(true)
    flags(['demandGeometry'])
    expect(await canOpenFromStore(viewer(), 'step', part21('AUTOMOTIVE_DESIGN'))).toBe(false)
    // The worker load needs a scene to stream into; without one the
    // main-thread engine parses, so the STEP buffers.
    flags(['demandGeometry', 'engineWorker'])
    const sceneless = viewer()
    sceneless.IFC.context = {}
    expect(await canOpenFromStore(sceneless, 'step', part21('AUTOMOTIVE_DESIGN'))).toBe(false)
  })

  it('the suffix decides nothing: a STEP named .ifc is a STEP, an IFC named .step an IFC', async () => {
    flags(['demandGeometry'])
    expect(await canOpenFromStore(viewer(), 'ifc', part21('AUTOMOTIVE_DESIGN'))).toBe(false)
    expect(await canOpenFromStore(viewer(), 'step', part21('IFC4'))).toBe(true)
  })

  it('no format conway detects, a non-part-21 type, or the kill switch buffers', async () => {
    flags(['demandGeometry', 'engineWorker'])
    expect(await canOpenFromStore(viewer(), 'step', new Blob(['not a part-21 file']))).toBe(false)
    expect(await canOpenFromStore(viewer(), 'glb', part21('IFC4'))).toBe(false)
    flags(['demandGeometry', 'engineWorker', 'disableStreamOpen'])
    expect(await canOpenFromStore(viewer(), 'ifc', part21('IFC4'))).toBe(false)
  })
})
