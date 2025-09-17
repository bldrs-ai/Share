/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names

global.importScripts = jest.fn()
global.self = {addEventListener: jest.fn(), postMessage: jest.fn()}
Object.defineProperty(global, 'navigator', {
  value: {storage: {getDirectory: jest.fn()}},
  writable: true,
  configurable: true,
})
global.CacheModule = {
  checkCacheRaw: jest.fn(),
  updateCacheRaw: jest.fn(),
  deleteCache: jest.fn(),
}

if (typeof File === 'undefined') {
  const {Blob} = require('buffer')
  global.File = class File extends Blob {
    /** Construct File */
    constructor(parts, name, options = {}) {
      super(parts, options)
      this.name = name
      this.lastModified = options.lastModified || Date.now()
    }
  }
}

if (typeof crypto === 'undefined') {
  global.crypto = require('crypto').webcrypto
}

// Minimal polyfills for Node test environment
if (typeof DOMException === 'undefined') {
  global.DOMException = class DOMException extends Error {
    /** Construct DOMException */
    constructor(message, name = 'Error') {
      super(message)
      this.name = name
    }
  }
}

if (typeof WritableStream === 'undefined') {
  // Node >=16 provides web streams in 'stream/web'
  try {
    global.WritableStream = require('stream/web').WritableStream
  } catch (_) {
    // Fallback no-op polyfill (satisfies type surface for tests that don't actually use pipe)
    global.WritableStream = class WritableStream {
      /** Construct WritableStream */
      // eslint-disable-next-line no-useless-constructor, no-empty-function, require-jsdoc
      constructor() {}
    }
  }
}

const worker = require('./OPFS.worker.js')

/**
 * Stub implementation of a file handle for in-memory OPFS.
 */
class FileHandle {
  /**
   * Creates a FileHandle.
   *
   * @param {string} name - Name of the file.
   * @param {Uint8Array} [data] - Initial data for the file.
   */
  constructor(name, data = new Uint8Array()) {
    this.name = name
    this.kind = 'file'
    this.data = data
  }

  /**
   * Returns a File object representing this handle's data.
   *
   * @return {Promise<File>}
   */
  async getFile() {
    await Promise.resolve()
    return new File([this.data], this.name)
  }

  /* eslint-disable require-await */

  /**
   * Creates a synchronous access handle for this file.
   *
   * @return {Promise<{getSize: function(): Promise<number>, read: function(ArrayBuffer, object):
   * Promise<void>, write: function(ArrayBuffer | Uint8Array, object):
   *  Promise<number>, close: function(): Promise<void>}>}
   */
  async createSyncAccessHandle() {
    const handle = this
    return {
      /**
       * Gets the size of the file in bytes.
       *
       * @return {Promise<number>}
       */
      async getSize() {
        await Promise.resolve()
        return handle.data.length
      },
      /**
       * Reads data into the provided buffer.
       *
       * @param {ArrayBuffer} buffer - Buffer to read data into.
       * @param {object} [options] - Read options.
       * @param {number} [options.at] - Position to start reading from.
       * @return {Promise<void>}
       */
      async read(buffer, {at = 0} = {}) {
        await Promise.resolve()
        new Uint8Array(buffer).set(handle.data.slice(at))
      },
      /**
       * Writes data to the file at the specified position.
       *
       * @param {ArrayBuffer|Uint8Array} buffer - Data to write.
       * @param {object} [options] - Write options.
       * @param {number} [options.at] - Position to start writing at.
       * @return {Promise<number>} Number of bytes written.
       */
      async write(buffer, {at = 0} = {}) {
        await Promise.resolve()
        const arr = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer
        if (at + arr.length > handle.data.length) {
          const newData = new Uint8Array(at + arr.length)
          newData.set(handle.data)
          handle.data = newData
        }
        handle.data.set(arr, at)
        return arr.length
      },
      /**
       * Closes the synchronous access handle.
       *
       * @return {Promise<void>}
       */
      async close() {
        await Promise.resolve()
      },
    }
  }

  /**
   * Creates a writable stream to overwrite this file's data.
   *
   * @return {Promise<{write: function(Blob|ArrayBuffer): Promise<void>, close: function(): Promise<void>}>}
   */
  async createWritable() {
    const handle = this
    // Implement as a real WritableStream so ReadableStream.pipeTo works
    let chunks = []
    return new WritableStream({
      /**
       * Write a chunk to the stream
       *
       * @param {any} data
       */
      async write(data) {
        if (data instanceof ArrayBuffer) {
          chunks.push(new Uint8Array(data))
        } else if (ArrayBuffer.isView(data)) {
          chunks.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
        } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
          const arr = new Uint8Array(await data.arrayBuffer())
          chunks.push(arr)
        } else {
          const enc = new TextEncoder()
          chunks.push(enc.encode(String(data)))
        }
      },
      /** Finalize and persist into handle.data */
      async close() {
        const total = chunks.reduce((sum, a) => sum + a.length, 0)
        const out = new Uint8Array(total)
        let offset = 0
        for (const a of chunks) {
          out.set(a, offset)
          offset += a.length
        }
        handle.data = out
      },
      async abort() {
        chunks = []
      },
    })
  }
}

/**
 * Stub implementation of a directory handle for in-memory OPFS.
 */
class DirectoryHandle {
  /**
   * Creates a DirectoryHandle.
   *
   * @param {string} name - Name of the directory.
   */
  constructor(name) {
    this.name = name
    this.kind = 'directory'
    this.entriesMap = new Map()
  }

  /**
   * Gets a handle for a subdirectory.
   *
   * @param {string} name - Subdirectory name.
   * @param {{create?: boolean}} [options] - Options for handle retrieval.
   * @return {Promise<DirectoryHandle>}
   * @throws {Error} If the directory does not exist and create is false.
   */
  async getDirectoryHandle(name, {create} = {}) {
    if (!this.entriesMap.has(name)) {
      if (!create) {
        throw new Error('not found')
      }
      const dir = new DirectoryHandle(name)
      this.entriesMap.set(name, dir)
      return dir
    }
    const handle = this.entriesMap.get(name)
    if (handle.kind !== 'directory') {
      throw new Error('not directory')
    }
    return handle
  }

  /**
   * Gets a handle for a file in this directory.
   *
   * @param {string} name - File name.
   * @param {{create?: boolean}} [options] - Options for handle retrieval.
   * @return {Promise<FileHandle>}
   * @throws {Error} If the file does not exist and create is false.
   */
  async getFileHandle(name, {create} = {}) {
    if (!this.entriesMap.has(name)) {
      if (!create) {
        throw new Error('not found')
      }
      const file = new FileHandle(name)
      this.entriesMap.set(name, file)
      return file
    }
    const handle = this.entriesMap.get(name)
    if (handle.kind !== 'file') {
      throw new Error('not file')
    }
    return handle
  }

  /**
   * Removes an entry from this directory.
   *
   * @param {string} name - Entry name to remove.
   * @return {Promise<void>}
   */
  async removeEntry(name) {
    this.entriesMap.delete(name)
  }

  /* eslint-enable require-await */
  /* eslint-disable jsdoc/require-yields */


  /**
   * Async iterator for entries in this directory.
   *
   * @return {any}
   */
  async* entries() {
    for (const [name, handle] of this.entriesMap.entries()) {
      yield [name, handle]
    }
  }
}

/* eslint-enable jsdoc/require-yields */
/* eslint-enable jsdoc/valid-types */

let rootDir
beforeEach(() => {
  rootDir = new DirectoryHandle('root')
  global.navigator = {storage: {getDirectory: jest.fn(() => Promise.resolve(rootDir))}}
  global.self = {postMessage: jest.fn()}
  global.importScripts = jest.fn()
  global.CacheModule = {
    checkCacheRaw: jest.fn(),
    updateCacheRaw: jest.fn(),
    deleteCache: jest.fn(),
  }
})

afterEach(() => {
  jest.clearAllMocks()
})

test('safePathSplit splits and trims slashes', () => {
  expect(worker.safePathSplit('/a/b/c')).toEqual(['a', 'b', 'c'])
  expect(worker.safePathSplit('a/b/c/')).toEqual(['a', 'b', 'c'])
})

test('base64ToBlob decodes string', async () => {
  const b64 = btoa('hello')
  const blob = worker.base64ToBlob(b64, 'text/plain')
  expect(await blob.text()).toBe('hello')
})

test('generateMockResponse sets sha header', async () => {
  const resp = worker.generateMockResponse('sha1')
  expect(resp.headers.get('shahash')).toBe('sha1')
  const json = await resp.json()
  expect(json.cached).toBe(false)
})

test('computeGitBlobSha1FromFile works', async () => {
  const file = new File(['hello'], 'test.txt')
  const hash = await worker.computeGitBlobSha1FromFile(file)
  expect(hash).toBe('b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0')
})

test('computeGitBlobSha1FromHandle works', async () => {
  const fileHandle = new FileHandle('test')
  fileHandle.data = new Uint8Array(Buffer.from('hello'))
  const hash = await worker.computeGitBlobSha1FromHandle(fileHandle)
  expect(hash).toBe('b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0')
})

test('retrieveFileWithPathNew matches file starting with segment', async () => {
  const folder = await rootDir.getDirectoryHandle('folder', {create: true})
  await folder.getFileHandle('model.ifc.etag.commit', {create: true})
  await folder.getFileHandle('other.ifc.etag.commit', {create: true})
  // eslint-disable-next-line no-unused-vars
  const [_dir, handle] = await worker.retrieveFileWithPathNew(
    rootDir,
    'folder/model.ifc',
    'etag',
    'commit',
    false,
  )
  expect(handle).toBe(
    await folder.getFileHandle('model.ifc.etag.commit', {create: false}),
  )
  const [, handle2] = await worker.retrieveFileWithPathNew(
    rootDir,
    'folder/model.ifc',
    'etag',
    'anothercommitbutmatchingetag',
    false,
  )
  expect(handle2).toBe(
    await folder.getFileHandle('model.ifc.etag.commit', {create: false}),
  )
})

test('deleteAllEntries removes all files', async () => {
  const sub = await rootDir.getDirectoryHandle('sub', {create: true})
  await sub.getFileHandle('file.txt', {create: true})
  await worker.deleteAllEntries(rootDir)
  const entries = []
  for await (const e of rootDir.entries()) {
    entries.push(e)
  }
  expect(entries.length).toBe(0)
})

test('snapshotCache posts directory snapshot', async () => {
  await rootDir.getFileHandle('foo.txt', {create: true})
  await worker.snapshotCache()
  expect(self.postMessage).toHaveBeenCalledWith({
    completed: true,
    event: 'snapshot',
    directoryStructure: '/foo.txt\tsize=0\thash=da39a3ee5e6b4b0d3255bfef95601890afd80709',
  })
})

// ------------------------------------------------------------
// renameFileInOPFS tests
// ------------------------------------------------------------

test('renameFileInOPFS falls back to stream copy+delete when move is unavailable', async () => {
  const oldHandle = await rootDir.getFileHandle('old.txt', {create: true})
  oldHandle.data = new Uint8Array(Buffer.from('hello'))

  const newHandle = await worker.renameFileInOPFS(rootDir, oldHandle, 'new.txt')

  // old should be gone
  await expect(rootDir.getFileHandle('old.txt', {create: false})).rejects.toThrow('not found')
  // new should exist with same contents
  const f = await newHandle.getFile()
  expect(await f.text()).toBe('hello')
})

test('renameFileInOPFS uses native two-arg move when available', async () => {
  const handle = await rootDir.getFileHandle('twoarg.txt', {create: true})
  handle.data = new Uint8Array(Buffer.from('two-arg'))

  // Attach a native-like two-arg move(dir, newName)
  /* eslint-disable no-invalid-this */
  /* eslint-disable require-await */
  handle.move = jest.fn(async function(dir, newName) {
    // simulate moving inside same dir: update map and handle name
    dir.entriesMap.delete(this.name)
    this.name = newName
    dir.entriesMap.set(newName, this)
  })
  /* eslint-enable require-await */

  const renamed = await worker.renameFileInOPFS(rootDir, handle, 'renamed.txt')
  expect(handle.move).toHaveBeenCalled()

  // old should be gone, new present
  await expect(rootDir.getFileHandle('twoarg.txt', {create: false})).rejects.toThrow('not found')
  const f = await renamed.getFile()
  expect(f.name).toBe('renamed.txt')
  expect(await f.text()).toBe('two-arg')
})

test('renameFileInOPFS supports single-arg move(newName) variant (Chromium style)', async () => {
  const handle = await rootDir.getFileHandle('single.txt', {create: true})
  handle.data = new Uint8Array(Buffer.from('one-arg'))

  // First call with 2 args should throw TypeError("Not enough arguments"), then single-arg works
  // eslint-disable-next-line require-await
  handle.move = jest.fn(async function(a, b) {
    if (typeof b !== 'undefined') {
      throw new TypeError('Not enough arguments')
    }
    const newName = a
    const dir = rootDir
    dir.entriesMap.delete(this.name)
    this.name = newName
    dir.entriesMap.set(newName, this)
  })
  /* eslint-enable no-invalid-this */

  const renamed = await worker.renameFileInOPFS(rootDir, handle, 'onlyname.txt')
  expect(handle.move).toHaveBeenCalledTimes(2)

  await expect(rootDir.getFileHandle('single.txt', {create: false})).rejects.toThrow('not found')
  const f = await renamed.getFile()
  expect(f.name).toBe('onlyname.txt')
  expect(await f.text()).toBe('one-arg')
})

test('renameFileInOPFS overwrite true removes existing destination before rename', async () => {
  // Existing destination file
  const existing = await rootDir.getFileHandle('dest.txt', {create: true})
  existing.data = new Uint8Array(Buffer.from('old'))
  // Source file
  const src = await rootDir.getFileHandle('src.txt', {create: true})
  src.data = new Uint8Array(Buffer.from('new'))

  // No native move: triggers stream fallback; overwrite will remove existing first
  const dest = await worker.renameFileInOPFS(rootDir, src, 'dest.txt', {overwrite: true})

  // Ensure only one dest remains, with "new" contents
  const file = await dest.getFile()
  expect(await file.text()).toBe('new')
  await expect(rootDir.getFileHandle('src.txt', {create: false})).rejects.toThrow('not found')
})

test('renameFileInOPFS falls back to copy+delete when native move throws', async () => {
  /* eslint-disable require-await */
  const src = await rootDir.getFileHandle('boom.txt', {create: true})
  src.data = new Uint8Array(Buffer.from('boom'))
  src.move = jest.fn(async () => {
    throw new Error('some engine issue')
  })

  const dest = await worker.renameFileInOPFS(rootDir, src, 'ok.txt')
  const file = await dest.getFile()
  expect(await file.text()).toBe('boom')
  await expect(rootDir.getFileHandle('boom.txt', {create: false})).rejects.toThrow('not found')
  /* eslint-enable require-await */
})
