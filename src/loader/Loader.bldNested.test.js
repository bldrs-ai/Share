/* eslint-disable require-await */
// A `.bld` assembly is the one model whose load runs OTHER loads:
// `BLDLoader.parse` calls `Loader#load` once per referenced object. Those
// nested loads used to behave like page-level loads — each took an artifact
// generation (clearing the slot the assembly's own load had just taken) and
// each published its own cached GLB, so "Download GLB" on a two-object scene
// offered whichever object finished last (#1833).
//
// These tests drive the REAL recursion: real BLDLoader, real Loader#load per
// child, with only the network and OPFS mocked. The GLB writer is stood in
// for — the real one serialises a Three scene through GLTFExporter, and all
// that matters here is the publish it makes at the end, under the generation
// its load handed it.
//
// Two of them enter at `load('….bld')`, the way the page does, so the outer
// load is real too: `findLoader`'s `bld` arm has to mark the loader async (or
// `readModel` reads `children` off the unresolved promise `parse` returns) and
// `parse` has to finish without calling a log method the stub lacks (#1839).
// The third stages state the outer load would have cleared — an artifact it
// had already published — so it enters at `BLDLoader.parse` with
// `beginGlbArtifactLoad()`, which is exactly what `load` does at its top.

import axios from 'axios'
import {downloadToOPFS, doesFileExistInOPFS} from '../OPFS/utils'
import ShareIfcLoader from '../viewer/ifc/ShareIfcLoader'
import useStore from '../store/useStore'
import BLDLoader from './BLDLoader'
import {load} from './Loader'
import {exportAndCacheGlb} from './glbExport'
import {
  beginGlbArtifactLoad,
  currentGlbArtifactGeneration,
  publishGlbArtifact,
} from './glbArtifactPublish'
import {dereferenceAndProxyDownloadContents} from './urls'


jest.mock('axios')

jest.mock('../OPFS/utils', () => ({
  getModelFromOPFS: jest.fn(),
  downloadToOPFS: jest.fn(),
  downloadModel: jest.fn(),
  doesFileExistInOPFS: jest.fn(),
  writeBase64Model: jest.fn(),
  deleteFileFromOPFS: jest.fn(),
  readModelByPathFromOPFS: jest.fn(),
}))

jest.mock('./urls', () => ({
  dereferenceAndProxyDownloadContents: jest.fn(),
}))

// Only `exportAndCacheGlb` is replaced; the module's constants stay real
// because `Loader.js` imports one of them for the GLB title extras.
jest.mock('./glbExport', () => ({
  ...jest.requireActual('./glbExport'),
  exportAndCacheGlb: jest.fn(),
}))


// A real (small) IFC, because each child runs the real parse: an empty
// part-21 shell gives conway nothing to build a model from, and the load then
// fails before reaching the writer these tests observe.
const IFC_BYTES = require('fs').readFileSync(
  require('path').resolve(__dirname, '../../testdata/models/ifc/index.ifc'), 'utf8')


// `metadata` is what header sniffing keys on to call a file a `.bld`
// (`Filetype#analyzeHeaderStr`).
const BLD_MANIFEST = JSON.stringify({metadata: {type: 'bld'}, objects: [{href: 'a.ifc'}, {href: 'b.ifc'}]})


/**
 * Page-level load of the two-object assembly, OPFS off for the outer file.
 *
 * @param {object} viewer
 * @return {Promise<object>}
 */
function loadBld(viewer) {
  return load('https://example.com/scene.bld', viewer, () => {}, false, () => {})
}


/** An OPFS `File` stand-in: what `Loader#load` actually calls on one. */
class FakeOpfsFile {
  /** @param {string} content */
  constructor(content) {
    this.content = content
    this.name = 'model.ifc'
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
 * Viewer whose Conway API parses the fixture above into an empty model —
 * enough for the load pipeline's shape, which is all these tests read. Same
 * stub shape as Loader.test.js's IFC viewer.
 *
 * @return {object}
 */
function makeIfcViewer() {
  const ifcAPI = {
    OpenModel: jest.fn(() => 0),
    StreamAllMeshes: jest.fn(() => {}),
    GetCoordinationMatrix: jest.fn().mockResolvedValue([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    getStatistics: jest.fn().mockReturnValue({
      getGeometryMemory: () => 0,
      getErrorCount: () => 0,
      getWarningCount: () => 0,
      getGeometryTime: () => 0,
      getVersion: () => 'IFC4',
      getLoadStatus: () => 'SUCCESS',
      getOriginatingSystem: () => 'test',
      getPreprocessorVersion: () => '1.0',
      getParseTime: () => 0,
      getTotalTime: () => 0,
    }),
    getConwayVersion: () => '1.0.0',
    properties: {
      getItemProperties: jest.fn(),
      getPropertySets: jest.fn(),
      getSpatialStructure: jest.fn(),
      getIfcType: jest.fn(),
    },
  }
  const viewer = {
    IFC: {
      type: null,
      ifcLastError: null,
      addIfcModel: jest.fn(),
      loader: {
        parse: jest.fn(),
        ifcManager: {
          state: {models: []},
          applyWebIfcConfig: jest.fn().mockResolvedValue(),
          setupCoordinationMatrix: jest.fn(),
          ifcAPI,
        },
      },
      context: {
        items: {ifcModels: []},
        fitToFrame: jest.fn(),
      },
    },
  }
  viewer.ifcLoader = new ShareIfcLoader({ifcAPI, ifc: viewer.IFC})
  return viewer
}


/** Let the idle-scheduled writers run (jsdom has no requestIdleCallback). */
async function flushScheduledWriters() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}


describe('a .bld assembly and the page-level GLB artifact (#1833)', () => {
  let viewer
  let publishResults

  // The non-GitHub cache key is a SHA-1 of the source bytes, so without
  // SubtleCrypto every child load logs a lookup failure and skips the writer
  // — the very thing these tests observe. Same defensive polyfill as
  // utils/contentHash.test.js.
  beforeAll(() => {
    if (!window.crypto || !window.crypto.subtle) {
      const {webcrypto} = require('crypto')
      Object.defineProperty(window, 'crypto', {value: webcrypto, configurable: true})
    }
  })

  beforeEach(() => {
    jest.clearAllMocks()
    viewer = makeIfcViewer()
    useStore.getState().setGlbArtifact(null)
    // Cache MISS for every child, so each one reaches the writer.
    doesFileExistInOPFS.mockResolvedValue(false)
    downloadToOPFS.mockResolvedValue(new FakeOpfsFile(IFC_BYTES))
    dereferenceAndProxyDownloadContents.mockImplementation(async (path) => [path, '', false, false])
    // The outer `.bld` is fetched over axios (OPFS off for it); each child
    // `.ifc` goes through the OPFS mock above. `bld` is not in
    // `supportedTypes`, so `findLoader` reaches the `bld` arm only by
    // sniffing the header — the ranged GET that comes back as bytes — and
    // the full download then asks for text.
    axios.get.mockImplementation(async (url, config) => {
      if (!url.endsWith('.bld')) {
        return {data: IFC_BYTES}
      }
      const isHeaderSniff = config?.headers?.Range !== undefined
      return {status: 200, data: isHeaderSniff ? new TextEncoder().encode(BLD_MANIFEST).buffer : BLD_MANIFEST}
    })
    // Stand-in writer: does what the real one does at the end of a successful
    // write — publish under the generation its load handed it (glbExport.js).
    // Every result is recorded, so the tests can assert the publish was
    // REFUSED rather than merely never attempted.
    publishResults = []
    exportAndCacheGlb.mockImplementation(async ({cacheKeyArgs, kindLabel, artifactGeneration}) => {
      publishResults.push(publishGlbArtifact(
        {cacheKeyArgs, schemaVer: '0.0.0-test', writtenAt: 1, kindLabel}, artifactGeneration))
      return true
    })
  })

  afterEach(() => {
    useStore.getState().setGlbArtifact(null)
  })

  it('leaves the assembly with no artifact, though every child produced one', async () => {
    const root = await loadBld(viewer)
    await flushScheduledWriters()

    expect(root.children).toHaveLength(2)
    // Both children ran their writer — the per-object cache still warms,
    // which is why the fix suppresses the PUBLISH rather than the load…
    expect(exportAndCacheGlb).toHaveBeenCalledTimes(2)
    // …and both publishes were refused, so the Export section offers nothing
    // rather than offering object B as if it were the whole scene.
    expect(publishResults).toEqual([false, false])
    expect(useStore.getState().glbArtifact).toBeNull()
  })

  it('does not spend an artifact generation per child', async () => {
    // A child that took its own generation would clear the slot mid-load —
    // so the assembly could not hold an artifact even once it has one — and
    // would then be the generation `publishGlbArtifact` accepts.
    const before = currentGlbArtifactGeneration()

    await loadBld(viewer)
    await flushScheduledWriters()

    // Exactly one bump: the outer load's own.
    expect(currentGlbArtifactGeneration()).toBe(before + 1)
  })

  it('leaves an artifact the enclosing load already published alone', async () => {
    // Stands in for any load whose slot is filled when a nested load starts:
    // the child must neither clear it (the generation bump) nor replace it.
    const outer = beginGlbArtifactLoad()
    const outerArtifact = {
      cacheKeyArgs: {ns1: 'BldrsLocalStorage', ns2: 'V1', ns3: 'Projects', sourcePath: 'scene.bld', sourceHash: 'sha'},
      schemaVer: '0.0.0-test',
      writtenAt: 1,
      kindLabel: 'external',
    }
    publishGlbArtifact(outerArtifact, outer)

    await new BLDLoader(viewer).parse(
      JSON.stringify({objects: [{href: 'a.ifc'}]}), 'https://example.com/scene.bld')
    await flushScheduledWriters()

    expect(useStore.getState().glbArtifact).toBe(outerArtifact)
  })
})
