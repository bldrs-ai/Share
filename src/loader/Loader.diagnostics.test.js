/* eslint-disable require-await */
// The GA diagnostics Loader#load sends after a SUCCESSFUL load
// (reportLoadDiagnostics.js, Share#2106 follow-ups): `preview_unit_skipped`
// once per load that skipped any preview unit, and `engine_source_buffered`
// for a worker load whose source opened buffered. Driven through the real
// `load` with the network and OPFS mocked and the IFC loader stood in for,
// as in Loader.engineSourceRelease.test.js.

import {Group, Mesh, BufferGeometry} from 'three'
import axios from 'axios'
import {downloadToOPFS, doesFileExistInOPFS} from '../OPFS/utils'
import {gtagEvent} from '../privacy/analytics'
import useStore from '../store/useStore'
import {load} from './Loader'
import {dereferenceAndProxyDownloadContents} from './urls'


jest.mock('axios')
jest.mock('../privacy/analytics', () => ({...jest.requireActual('../privacy/analytics'), gtagEvent: jest.fn()}))
jest.mock('../OPFS/utils', () => ({
  getModelFromOPFS: jest.fn(),
  downloadToOPFS: jest.fn(),
  downloadModel: jest.fn(),
  doesFileExistInOPFS: jest.fn(),
  writeBase64Model: jest.fn(),
  deleteFileFromOPFS: jest.fn(),
  readModelByPathFromOPFS: jest.fn(),
}))
jest.mock('./urls', () => ({dereferenceAndProxyDownloadContents: jest.fn()}))


const IFC_TEXT = 'ISO-10303-21;\nHEADER;\nFILE_SCHEMA((\'IFC4\'));\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n'
const SECRET_PATH = 'https://github.com/secret-org/secret-repo/blob/main/private.ifc'
const GA_PATTERN = /secret|private\.ifc/


/** An OPFS `File` stand-in. */
class FakeOpfsFile {
  /** @param {string} content */
  constructor(content) {
    this.content = content
    this.name = 'private.ifc'
    this.size = content.length
    this.lastModified = 1
  }

  /** @return {Promise<ArrayBuffer>} */
  async arrayBuffer() {
    return new TextEncoder().encode(this.content).buffer
  }

  /** @return {Promise<string>} */
  async text() {
    return this.content
  }

  /**
   * @param {number} start
   * @param {number} end
   * @return {FakeOpfsFile}
   */
  slice(start, end) {
    return new FakeOpfsFile(this.content.slice(start, end))
  }
}


/**
 * @param {object} modelExtras fields the parsed model carries
 * @param {Error} [parseError] makes the IFC loader throw instead
 * @return {object} a viewer whose IFC loader returns the model
 */
function makeViewer(modelExtras, parseError) {
  const viewer = {
    IFC: {
      type: null,
      ifcLastError: null,
      addIfcModel: jest.fn(),
      loader: {ifcManager: {state: {models: []}, ifcAPI: {}}},
      context: {items: {ifcModels: []}, fitToFrame: jest.fn()},
    },
  }
  viewer.ifcLoader = {
    type: 'ifc',
    parse: jest.fn(async () => {
      if (parseError) {
        throw parseError
      }
      const model = new Group()
      model.add(new Mesh(new BufferGeometry()))
      model.modelID = 0
      Object.assign(model, modelExtras)
      return model
    }),
  }
  return viewer
}


/**
 * @param {object} summary the worker's done summary, or undefined for none
 * @return {object} model fields for a worker load
 */
function workerModel(summary) {
  return {
    ifcManager: {ifcAPI: {engineSession: {kind: 'worker', spill: jest.fn(async () => ({spilled: false})), capture: jest.fn()}, summary}},
  }
}


/** @return {Array} the diagnostics events GA got */
function diagnosticEvents() {
  return gtagEvent.mock.calls.filter(([name]) => name === 'preview_unit_skipped' || name === 'engine_source_buffered')
}


describe('Loader#load GA diagnostics', () => {
  beforeAll(() => {
    if (!window.crypto || !window.crypto.subtle) {
      const {webcrypto} = require('crypto')
      Object.defineProperty(window, 'crypto', {value: webcrypto, configurable: true})
    }
  })

  beforeEach(() => {
    jest.clearAllMocks()
    useStore.getState().setGlbArtifact(null)
    doesFileExistInOPFS.mockResolvedValue(false)
    downloadToOPFS.mockResolvedValue(new FakeOpfsFile(IFC_TEXT))
    dereferenceAndProxyDownloadContents.mockImplementation(async (path) => [path, '', false, false])
    axios.get.mockResolvedValue({data: IFC_TEXT})
  })

  it('sends one preview_unit_skipped for a successful load that skipped units', async () => {
    const viewer = makeViewer({previewUnitsSkipped: 4})
    await load(SECRET_PATH, viewer, () => {}, true, () => {})
    expect(diagnosticEvents()).toEqual([
      ['preview_unit_skipped', {format: 'ifc', kind: 'github', skipped: '2-10'}],
    ])
  })

  it('sends nothing when no unit was skipped', async () => {
    await load(SECRET_PATH, makeViewer({previewUnitsSkipped: 0}), () => {}, true, () => {})
    expect(diagnosticEvents()).toEqual([])
  })

  it('sends nothing for a load that throws after skipping units', async () => {
    const viewer = makeViewer({previewUnitsSkipped: 4}, new Error('engine failed'))
    await expect(load(SECRET_PATH, viewer, () => {}, true, () => {})).rejects.toThrow()
    expect(diagnosticEvents()).toEqual([])
  })

  it('sends engine_source_buffered with the reason and size class for a worker load that buffered', async () => {
    // OPFS off: the source is fetched as bytes, so the worker opens it buffered.
    const viewer = makeViewer(workerModel({source: {kind: 'resident'}}))
    await load(SECRET_PATH, viewer, () => {}, false, () => {})
    expect(diagnosticEvents()).toEqual([
      ['engine_source_buffered', {reason: 'opfs-unavailable', size_class: '<10MB'}],
    ])
  })

  it('also counts a done summary with no source at all as buffered', async () => {
    const viewer = makeViewer(workerModel({}))
    await load(SECRET_PATH, viewer, () => {}, false, () => {})
    expect(diagnosticEvents().map(([name]) => name)).toEqual(['engine_source_buffered'])
  })

  it('sends nothing for a worker load whose source opened windowed', async () => {
    const viewer = makeViewer(workerModel({source: {kind: 'syncHandle'}}))
    await load(SECRET_PATH, viewer, () => {}, false, () => {})
    expect(diagnosticEvents()).toEqual([])
  })

  it('sends nothing for a main-thread load, which has no engine session', async () => {
    await load(SECRET_PATH, makeViewer({}), () => {}, false, () => {})
    expect(diagnosticEvents()).toEqual([])
  })

  it('never puts the source path or file name in a diagnostics event', async () => {
    const viewer = makeViewer({previewUnitsSkipped: 1, ...workerModel({source: {kind: 'resident'}})})
    await load(SECRET_PATH, viewer, () => {}, false, () => {})
    const events = diagnosticEvents()
    expect(events.map(([name]) => name).sort()).toEqual(['engine_source_buffered', 'preview_unit_skipped'])
    expect(JSON.stringify(events)).not.toMatch(GA_PATTERN)
  })
})
