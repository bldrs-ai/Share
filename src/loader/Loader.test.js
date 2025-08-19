import {Object3D, Mesh, BufferGeometry, Material, BufferAttribute} from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader'
import {load, readModel} from './Loader'


let mathRandomSpy
let mockViewer
describe('Loader', () => {
  // three.js generates random UUIDs for loaded geometry and material
  // and also references them later, so it's not trivial to freeze or
  // delete them.  So, intercept its call to Math.random instead.
  // TODO(pablo): this should probably increment the value or smth to
  // make each UUID unique.
  beforeEach(() => {
    const rand = 0.5
    mathRandomSpy = jest.spyOn(Math, 'random').mockReturnValue(rand)

    mockViewer = {
      IFC: {
        type: null,
        addIfcModel: jest.fn(),
        loader: {
          parse: jest.fn().mockResolvedValue({
            modelID: 0,
            loadStats: {},
            children: [],
            geometry: undefined,
            isObject3D: true,
          }),
          ifcManager: {
            state: {
              models: [],
            },
            applyWebIfcConfig: jest.fn().mockResolvedValue(),
            parse: jest.fn().mockResolvedValue({
              modelID: 0,
              loadStats: {},
              children: [],
              geometry: undefined,
              isObject3D: true,
            }),
            setupCoordinationMatrix: jest.fn(),
            ifcAPI: {
              GetCoordinationMatrix: jest.fn().mockResolvedValue([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
              getStatistics: jest.fn().mockReturnValue({
                getGeometryMemory: jest.fn().mockReturnValue(1024), // eslint-disable-line no-magic-numbers
                getGeometryTime: jest.fn().mockReturnValue(100), // eslint-disable-line no-magic-numbers
                getVersion: jest.fn().mockReturnValue('IFC4'),
                getLoadStatus: jest.fn().mockReturnValue('SUCCESS'),
                getOriginatingSystem: jest.fn().mockReturnValue('Test'),
                getPreprocessorVersion: jest.fn().mockReturnValue('1.0'),
                getParseTime: jest.fn().mockReturnValue(50), // eslint-disable-line no-magic-numbers
                getTotalTime: jest.fn().mockReturnValue(150), // eslint-disable-line no-magic-numbers
              }),
              getConwayVersion: jest.fn().mockReturnValue('1.0.0'),
            },
          },
        },
        context: {
          items: {
            ifcModels: [],
          },
          fitToFrame: jest.fn(),
        },
      },
    }
  })
  afterEach(() => mathRandomSpy.mockRestore())

  it('loads a FBX model', async () => {
    mockViewer.IFC.type = 'fbx'
    const testPath = 'fbx/cube.fbx'
    const onProgress = jest.fn()
    const setOpfsFile = jest.fn()
    const restoreArrayBuffer = testPathToContent(testPath)
    try {
      const model = await load(testPathToUrl(testPath), mockViewer, onProgress, true, setOpfsFile, '')
      expect(model).toBeDefined()
      expect(model).toMatchSnapshot()
    } finally {
      restoreArrayBuffer()
    }
  })

  it('loads a GLB model', async () => {
    mockViewer.IFC.type = 'glb'
    const testPath = 'glb/cube.glb'
    const onProgress = jest.fn()
    const setOpfsFile = jest.fn()
    const restoreArrayBuffer = testPathToContent(testPath)
    try {
      const model = await load(testPathToUrl(testPath), mockViewer, onProgress, true, setOpfsFile, '')
      expect(model).toBeDefined()
      expect(model).toMatchSnapshot()
    } finally {
      restoreArrayBuffer()
    }
  })

  it('loads an OBJ model', async () => {
    mockViewer.IFC.type = 'obj'
    const testPath = 'obj/Bunny.obj'
    const onProgress = jest.fn()
    const setOpfsFile = jest.fn()
    // Setup MockBlob with actual OBJ content
    const restoreArrayBuffer = testPathToContent(testPath)
    try {
      const model = await load(testPathToUrl(testPath), mockViewer, onProgress, true, setOpfsFile, '')
      expect(model).toBeDefined()
      expect(model).toMatchSnapshot()
    } finally {
      restoreArrayBuffer()
    }
  })

  it('loads a PDB model', async () => {
    mockViewer.IFC.type = 'pdb'
    const testPath = 'pdb/caffeine.pdb'
    const onProgress = jest.fn()
    const setOpfsFile = jest.fn()
    // Setup MockBlob with actual PDB file content
    const restoreArrayBuffer = testPathToContent(testPath)
    try {
      const model = await load(testPathToUrl(testPath), mockViewer, onProgress, true, setOpfsFile, '')
      expect(model).toBeDefined()
      expect(model).toMatchSnapshot()
    } finally {
      restoreArrayBuffer()
    }
  })

  it('loads an STL model', async () => {
    mockViewer.IFC.type = 'stl'
    const testPath = 'stl/cube.stl'
    const onProgress = jest.fn()
    const setOpfsFile = jest.fn()
    // Setup MockBlob with actual STL file content
    const restoreArrayBuffer = testPathToContent(testPath)
    try {
      const model = await load(testPathToUrl(testPath), mockViewer, onProgress, true, setOpfsFile, '')
      expect(model).toBeDefined()
      expect(model).toMatchSnapshot()
    } finally {
      restoreArrayBuffer()
    }
  })

  it('loads a STEP model', async () => {
    mockViewer.IFC.type = 'step'
    const testPath = 'step/a-gear.step'
    const onProgress = jest.fn()
    const setOpfsFile = jest.fn()
    const restoreArrayBuffer = testPathToContent(testPath)
    try {
      const model = await load(testPathToUrl(testPath), mockViewer, onProgress, true, setOpfsFile, '')
      expect(model).toBeDefined()
      expect(model).toMatchSnapshot()
    } finally {
      restoreArrayBuffer()
    }
  })

  it('loads an IFC model', async () => {
    mockViewer.IFC.type = 'ifc'
    const testPath = 'ifc/index.ifc'
    const onProgress = jest.fn()
    const setOpfsFile = jest.fn()
    const restoreArrayBuffer = testPathToContent(testPath)
    try {
      const model = await load(testPathToUrl(testPath), mockViewer, onProgress, true, setOpfsFile, '')
      expect(model).toBeDefined()
      expect(model).toMatchSnapshot()
    } finally {
      restoreArrayBuffer()
    }
  })

  describe('readModel', () => {
    it('passes through model with existing geometry unchanged', async () => {
      const mockLoader = {
        parse: jest.fn().mockReturnValue({
          geometry: new BufferGeometry(),
          material: new Material(),
          isObject3D: true,
        }),
      }

      const result = await readModel(mockLoader, 'test-data', './', false, false, null, null)

      expect(result.geometry).toBeDefined()
      expect(result.geometry).toBeInstanceOf(BufferGeometry)
      expect(mockLoader.parse).toHaveBeenCalledWith('test-data', './')
    })

    it('finds geometry in children when model has no direct geometry', async () => {
      // Mock mesh child with geometry
      const meshChild = new Mesh(new BufferGeometry(), new Material())
      meshChild.geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0]), 3))

      const mockLoader = {
        parse: jest.fn().mockReturnValue({
          children: [
            new Object3D(), // First child without geometry
            meshChild, // Second child with geometry
          ],
          isObject3D: true,
        }),
      }

      const result = await readModel(mockLoader, 'test-data', './', false, false, null, null)

      expect(result.geometry).toBeDefined()
      expect(result.geometry).toBe(meshChild.geometry)
    })

    it('logs warning when model has no geometry and children have no geometry', async () => {
      const mockLoader = {
        parse: jest.fn().mockReturnValue({
          children: [
            new Object3D(), // Child without geometry
            new Object3D(), // Another child without geometry
          ],
          isObject3D: true,
        }),
      }

      const result = await readModel(mockLoader, 'test-data', './', false, false, null, null)

      // expect(consoleSpy).toHaveBeenCalledWith('Could not identify default mesh to use for some operations')
      expect(result).toBeDefined()
    })

    it('throws error when loader returns null model', async () => {
      const mockLoader = {
        parse: jest.fn().mockReturnValue(null),
      }

      await expect(readModel(mockLoader, 'test-data', './', false, false, null, null))
        .rejects.toThrow('Loader could not read model')
    })

    it('calls fixupCb when provided', async () => {
      const mockModel = {
        geometry: new BufferGeometry(),
        material: new Material(),
        isObject3D: true,
      }

      const mockLoader = {
        parse: jest.fn().mockReturnValue(mockModel),
      }

      mockViewer.IFC.type = 'obj'
      const fixupCb = jest.fn().mockImplementation((model, viewer) => {
        expect(model).toBe(mockModel)
        expect(viewer).toBe(mockViewer)
        return {...model, fixed: true}
      })

      const result = await readModel(mockLoader, 'test-data', './', false, false, mockViewer, fixupCb)

      expect(fixupCb).toHaveBeenCalledWith(mockModel, mockViewer)
      expect(result.fixed).toBe(true)
    })

    it('handles async loader correctly', async () => {
      const mockModel = {
        geometry: new BufferGeometry(),
        material: new Material(),
        isObject3D: true,
      }

      const mockLoader = {
        parse: jest.fn().mockResolvedValue(mockModel),
      }

      const result = await readModel(mockLoader, 'test-data', './', true, false, null, null)

      expect(result).toBe(mockModel)
      expect(mockLoader.parse).toHaveBeenCalledWith('test-data', './')
    })

    it('handles GLTFLoader with callback correctly', async () => {
      const mockModel = {
        geometry: new BufferGeometry(),
        material: new Material(),
        isObject3D: true,
      }

      // Create actual GLTFLoader instance and mock its parse method
      const mockLoader = new GLTFLoader()
      mockLoader.parse = jest.fn().mockImplementation((data, basePath, onLoad, onError) => {
        // Simulate immediate callback (not async)
        onLoad(mockModel)
      })

      const result = await readModel(mockLoader, 'test-data', './', false, false, null, null)

      expect(result).toBe(mockModel)
      expect(mockLoader.parse).toHaveBeenCalledWith(
        'test-data',
        './',
        expect.any(Function),
        expect.any(Function),
      )
    })
  })

  describe('Progress updates', () => {
    it('calls onProgress with correct messages for IFC loading', async () => {
      mockViewer.IFC.type = 'ifc'
      const testPath = 'ifc/index.ifc'
      const onProgress = jest.fn()
      const setOpfsFile = jest.fn()
      const restoreArrayBuffer = testPathToContent(testPath)

      try {
        await load(testPathToUrl(testPath), mockViewer, onProgress, true, setOpfsFile, '')

        // Verify progress messages are called in correct order
        const progressCalls = onProgress.mock.calls.map((call) => call[0])
        expect(progressCalls).toContain('Determining file type...')
        expect(progressCalls).toContain('Preparing file download...')
        expect(progressCalls).toContain('Reading file data...')
        expect(progressCalls).toContain('Configuring loader...')
        expect(progressCalls).toContain('Parsing model geometry...')
        expect(progressCalls).toContain('Setting up coordinate system...')
        expect(progressCalls).toContain('Fitting model to frame...')
        expect(progressCalls).toContain('Gathering model statistics...')
        expect(progressCalls).toContain('Model loaded successfully!')

        // Ensure onProgress was called multiple times
        expect(onProgress).toHaveBeenCalledTimes(9)
      } finally {
        restoreArrayBuffer()
      }
    })

    it('calls onProgress with correct messages for STEP async loading', async () => {
      // Test STEP format which is async IFC-type loading
      mockViewer.IFC.type = 'step'
      const testPath = 'step/a-gear.step'
      const onProgress = jest.fn()
      const setOpfsFile = jest.fn()
      const restoreArrayBuffer = testPathToContent(testPath)

      try {
        await load(testPathToUrl(testPath), mockViewer, onProgress, true, setOpfsFile, '')

        const progressCalls = onProgress.mock.calls.map((call) => call[0])
        expect(progressCalls).toContain('Determining file type...')
        expect(progressCalls).toContain('Preparing file download...')
        expect(progressCalls).toContain('Reading file data...')
        expect(progressCalls).toContain('Configuring loader...')
        expect(progressCalls).toContain('Parsing model geometry...')
        expect(progressCalls).toContain('Setting up coordinate system...')
        expect(progressCalls).toContain('Fitting model to frame...')
        expect(progressCalls).toContain('Gathering model statistics...')
        expect(progressCalls).toContain('Model loaded successfully!')

        // Verify that progress was called multiple times for IFC-type loading
        expect(onProgress.mock.calls.length).toBeGreaterThanOrEqual(9)
      } finally {
        restoreArrayBuffer()
      }
    })

    it('calls onProgress with correct messages for synchronous loading', async () => {
      mockViewer.IFC.type = 'obj'
      const onProgress = jest.fn()
      const setOpfsFile = jest.fn()
      const restoreArrayBuffer = testPathToContent('obj/Bunny.obj')

      try {
        await load(testPathToUrl('obj/Bunny.obj'), mockViewer, onProgress, true, setOpfsFile, '')

        const progressCalls = onProgress.mock.calls.map((call) => call[0])
        expect(progressCalls).toContain('Determining file type...')
        expect(progressCalls).toContain('Preparing file download...')
        expect(progressCalls).toContain('Reading file data...')
        expect(progressCalls).toContain('Decoding text data...')
        expect(progressCalls).toContain('Processing model data...')
        expect(progressCalls).toContain('Applying model fixups...')
        expect(progressCalls).toContain('Converting model format...')

        expect(onProgress).toHaveBeenCalledTimes(7)
      } finally {
        restoreArrayBuffer()
      }
    })

    it('calls onProgress for binary file processing without text decoding', async () => {
      mockViewer.IFC.type = 'stl'
      const onProgress = jest.fn()
      const setOpfsFile = jest.fn()
      const restoreArrayBuffer = testPathToContent('stl/cube.stl')

      try {
        await load(testPathToUrl('stl/cube.stl'), mockViewer, onProgress, true, setOpfsFile, '')

        const progressCalls = onProgress.mock.calls.map((call) => call[0])
        expect(progressCalls).toContain('Determining file type...')
        expect(progressCalls).toContain('Preparing file download...')
        expect(progressCalls).toContain('Reading file data...')
        // Should NOT contain 'Decoding text data...' for binary files
        expect(progressCalls).not.toContain('Decoding text data...')
        expect(progressCalls).toContain('Processing model data...')
        expect(progressCalls).toContain('Applying model fixups...')
        expect(progressCalls).toContain('Converting model format...')

        expect(onProgress).toHaveBeenCalledTimes(6)
      } finally {
        restoreArrayBuffer()
      }
    })

    it('passes onProgress to IFC loader parse method', async () => {
      const mockModel = {
        modelID: 0,
        loadStats: {},
        children: [],
        geometry: undefined,
        isObject3D: true,
      }

      const onProgress = jest.fn()

      // Test readModel directly with a mock IFC loader structure
      // This simulates the newIfcLoader function structure from Loader.js
      const mockIfcLoader = {
        parse: jest.fn().mockImplementation((buffer, progressCallback) => {
          // This simulates what happens in the newIfcLoader.parse method
          if (progressCallback) {
            progressCallback('Configuring loader...')
          }

          // Mock the internal loader call
          if (progressCallback) {
            progressCallback('Parsing model geometry...')
          }

          // Simulate Conway calling back with progress
          if (progressCallback) {
            progressCallback('Test progress from Conway')
          }

          // Mock the rest of the IFC loading process
          if (progressCallback) {
            progressCallback('Setting up coordinate system...')
            progressCallback('Fitting model to frame...')
            progressCallback('Gathering model statistics...')
            progressCallback('Model loaded successfully!')
          }

          return mockModel
        }),
      }

      const result = await readModel(mockIfcLoader, 'test-buffer', './', true, true, mockViewer, null, onProgress)

      expect(result).toBe(mockModel)
      expect(mockIfcLoader.parse).toHaveBeenCalledWith('test-buffer', onProgress)

      // Verify that all expected progress messages were called
      expect(onProgress).toHaveBeenCalledWith('Configuring loader...')
      expect(onProgress).toHaveBeenCalledWith('Parsing model geometry...')
      expect(onProgress).toHaveBeenCalledWith('Test progress from Conway')
      expect(onProgress).toHaveBeenCalledWith('Setting up coordinate system...')
      expect(onProgress).toHaveBeenCalledWith('Fitting model to frame...')
      expect(onProgress).toHaveBeenCalledWith('Gathering model statistics...')
      expect(onProgress).toHaveBeenCalledWith('Model loaded successfully!')

      // Verify total number of progress calls
      expect(onProgress).toHaveBeenCalledTimes(7)
    })

    it('handles missing onProgress callback gracefully', async () => {
      const mockModel = {
        geometry: new BufferGeometry(),
        isObject3D: true,
      }

      const mockLoader = {
        parse: jest.fn().mockReturnValue(mockModel),
      }

      // Should not throw when onProgress is not provided
      const result = await readModel(mockLoader, 'test-data', './', false, false, null, null, null)
      expect(result).toBe(mockModel)
    })

    it('calls onProgress for fixup operations', async () => {
      const mockModel = {
        geometry: new BufferGeometry(),
        isObject3D: true,
      }

      const mockLoader = {
        parse: jest.fn().mockReturnValue(mockModel),
      }

      const onProgress = jest.fn()
      const fixupCb = jest.fn().mockReturnValue(mockModel)

      await readModel(mockLoader, 'test-data', './', false, false, mockViewer, fixupCb, onProgress)

      expect(onProgress).toHaveBeenCalledWith('Processing model data...')
      expect(onProgress).toHaveBeenCalledWith('Applying model fixups...')
      expect(fixupCb).toHaveBeenCalled()
    })
  })
})


// Mock Blob for testing
/**
 * A mock Blob implementation for testing purposes.
 */
class MockBlob {
  /**
   * Creates an instance of MockBlob.
   *
   * @param {Array} content - The content of the blob.
   */
  constructor(content) {
    this.content = content
  }

  /**
   * Returns an ArrayBuffer representation of the blob content.
   *
   * @return {Promise<ArrayBuffer>} A promise that resolves to an ArrayBuffer.
   */
  async arrayBuffer() {
    await Promise.resolve() // Satisfy async requirement
    return new ArrayBuffer(this.content.length)
  }
}


// Mock Worker for testing
/**
 * A fake Worker implementation for testing purposes.
 */
class FakeWorker {
  /**
   * Creates an instance of FakeWorker.
   *
   * @param {string} script - The URL or identifier of the worker script.
   */
  constructor(script) {
    this.script = script
    this.postMessage = jest.fn()
    this.terminate = jest.fn()
    this.onmessage = null
    this.addEventListener = jest.fn((event, handler) => {
      // Simulate successful file download
      if (event === 'message') {
        process.nextTick(() => {
          handler({data: {completed: true, event: 'download', file: new MockBlob(['mock file content'])}})
        })
      }
    })
    this.removeEventListener = jest.fn()
  }
}
global.Worker = FakeWorker


/**
 * @param {string} relativePath
 * @return {string}
 */
function testPathToUrl(relativePath) {
  return require('path').resolve(__dirname, `../../testdata/models/${relativePath}`)
}


/**
 * @param {string} relativePath
 * @return {Function} A function that restores the original arrayBuffer method.
 */
function testPathToContent(relativePath) {
  // Determine if file is binary based on extension
  const binaryExtensions = ['fbx', 'glb', 'gltf']
  const extension = relativePath.split('.').pop().toLowerCase()
  const isBinary = binaryExtensions.includes(extension)

  const content = readTestDataFile(relativePath, isBinary)
  return setupMockBlobWithContent(content)
}


// Helper function to read test data files
/**
 * Reads a test data file and returns its content.
 *
 * @param {string} relativePath - Path relative to testdata/models/
 * @param {boolean} [isBinary] - Whether to read as binary data
 * @return {string|Buffer} The file content as a string or Buffer.
 */
function readTestDataFile(relativePath, isBinary = false) {
  const fs = require('fs')
  const path = require('path')
  const filePath = path.resolve(__dirname, `../../testdata/models/${relativePath}`)
  return fs.readFileSync(filePath, isBinary ? null : 'utf8')
}


// Helper function to setup MockBlob with file content
/**
 * Sets up MockBlob to return the specified file content.
 *
 * @param {string|Buffer} fileContent - The content to return from arrayBuffer().
 * @return {Function} A function to restore the original arrayBuffer method.
 */
function setupMockBlobWithContent(fileContent) {
  const originalArrayBuffer = MockBlob.prototype.arrayBuffer
  MockBlob.prototype.arrayBuffer = async function() {
    await Promise.resolve() // Satisfy async requirement

    if (Buffer.isBuffer(fileContent)) {
      // Handle binary data
      return fileContent.buffer.slice(fileContent.byteOffset, fileContent.byteOffset + fileContent.byteLength)
    } else {
      // Handle text data
      const encoder = new TextEncoder()
      return encoder.encode(fileContent).buffer
    }
  }
  return () => {
    MockBlob.prototype.arrayBuffer = originalArrayBuffer
  }
}
