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
    /**
     * Construct File
     *
     * @param {Array} parts - File parts
     * @param {string} name - File name
     * @param {object} options - Options
     */
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
    /**
     * Construct DOMException
     *
     * @param {string} message - Error message
     * @param {string} name - Error name
     */
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
    // `lastModified` is set only by tests that age an entry.
    return new File([this.data], this.name, this.lastModified === undefined ? {} : {lastModified: this.lastModified})
  }

  /* eslint-disable require-await */

  /**
   * Creates a synchronous access handle for this file.
   *
   * @return {Promise<object>}
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
       * Truncates the file to the given size.
       *
       * @param {number} size - New file size in bytes.
       * @return {Promise<void>}
       */
      async truncate(size) {
        await Promise.resolve()
        const next = new Uint8Array(size)
        next.set(handle.data.slice(0, Math.min(size, handle.data.length)))
        handle.data = next
      },
      /**
       * Flushes buffered writes. No-op for the in-memory stub.
       *
       * @return {Promise<void>}
       */
      async flush() {
        await Promise.resolve()
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
   * @return {Promise<object>}
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
   * @param {object} options - Options for handle retrieval.
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
   * @param {object} options - Options for handle retrieval.
   * @return {Promise<FileHandle>}
   * @throws {Error} If the file does not exist and create is false.
   */
  async getFileHandle(name, {create} = {}) {
    if (!this.entriesMap.has(name)) {
      if (!create) {
        throw new Error('not found')
      }
      const file = new FileHandle(name)
      // Only the move() stub below reads it.
      file.parent = this
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

/**
 * A FileSystemHandle anywhere in a reply, or null. WebKit cannot
 * structured-clone FileSystemHandles (bug 256712): a reply carrying one
 * becomes a DataCloneError there, which turns every File-carrying reply into
 * an error on Safari and iOS. So no reply may carry one (engine-worker.md §7
 * step 4: the engine worker finds the entry itself).
 *
 * @param {*} value
 * @param {Set} [seen]
 * @return {object|null}
 */
function findHandle(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return null
  }
  seen.add(value)
  if (value instanceof FileHandle || value instanceof DirectoryHandle ||
      typeof value.getFile === 'function' || typeof value.createSyncAccessHandle === 'function') {
    return value
  }
  for (const inner of Object.values(value)) {
    const found = findHandle(inner, seen)
    if (found) {
      return found
    }
  }
  return null
}

afterEach(() => {
  // Every reply any test drew from the worker stays clone-safe everywhere.
  for (const [message] of global.self?.postMessage?.mock?.calls ?? []) {
    expect(findHandle(message)).toBeNull()
  }
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

  const [, handle] = await worker.retrieveFileWithPathNew(
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

test('deleteAllEntries skips an entry another handle holds, and removes the rest', async () => {
  // engine-worker.md §7 step 4: an engine worker reading an open model
  // through a read-only sync access handle locks that entry against
  // removeEntry (NoModificationAllowedError). The clear must go on past it.
  const locked = new Set(['open.ifc', 'held.ifc'])
  const lockable = (dir) => {
    const remove = dir.removeEntry.bind(dir)
    dir.removeEntry = async (name, options) => {
      if (locked.has(name)) {
        throw new DOMException('locked', 'NoModificationAllowedError')
      }
      return await remove(name, options)
    }
    return dir
  }
  lockable(rootDir)
  await rootDir.getFileHandle('open.ifc', {create: true})
  const sub = lockable(await rootDir.getDirectoryHandle('sub', {create: true}))
  await sub.getFileHandle('held.ifc', {create: true})
  await sub.getFileHandle('free.ifc', {create: true})
  await rootDir.getDirectoryHandle('empty', {create: true})
  await rootDir.getFileHandle('z.txt', {create: true})

  const skipped = await worker.deleteAllEntries(rootDir)

  expect(skipped).toEqual(['open.ifc', 'sub/held.ifc'])
  expect(Array.from(rootDir.entriesMap.keys())).toEqual(['open.ifc', 'sub'])
  expect(Array.from(sub.entriesMap.keys())).toEqual(['held.ifc'])
})


test('deleteAllEntries still fails on an error that is not a lock', async () => {
  await rootDir.getFileHandle('a.ifc', {create: true})
  rootDir.removeEntry = () => Promise.reject(new Error('disk on fire'))
  await expect(worker.deleteAllEntries(rootDir)).rejects.toThrow('disk on fire')
})


test('clearCache reports what it skipped', async () => {
  await rootDir.getFileHandle('open.ifc', {create: true})
  rootDir.removeEntry = () => Promise.reject(new DOMException('locked', 'NoModificationAllowedError'))
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => null)
  await worker.clearCache(7)
  expect(self.postMessage).toHaveBeenCalledWith({completed: true, event: 'clear', skipped: ['open.ifc'], requestId: 7})
  expect(warn).toHaveBeenCalledWith('OPFS clear: skipped 1 locked entry:', ['open.ifc'])
  warn.mockRestore()
})


/**
 * owner/repo/branch/<file>.<commit> in the in-memory OPFS, whose remove()
 * fails the way a held entry's does (engine-worker.md §7 step 4).
 *
 * @param {string} fileName
 * @param {string} commitHash
 * @return {Promise<FileHandle>}
 */
async function lockedModelEntry(fileName, commitHash) {
  const owner = await rootDir.getDirectoryHandle('owner', {create: true})
  const repo = await owner.getDirectoryHandle('repo', {create: true})
  const branch = await repo.getDirectoryHandle('main', {create: true})
  const entry = await branch.getFileHandle(`${fileName}.${commitHash}`, {create: true})
  entry.remove = () => Promise.reject(new DOMException('locked', 'NoModificationAllowedError'))
  return entry
}


test('deleteModelFromOPFS answers a held entry with an error, not a false \'deleted\'', async () => {
  await lockedModelEntry('m.ifc', 'c1')
  await worker.deleteModelFromOPFS('c1', 'm.ifc', 'owner', 'repo', 'main', 3)
  expect(self.postMessage.mock.calls.map(([m]) => m)).toEqual([
    {error: 'deleteModelFromOPFS: m.ifc.c1 is open in an engine; not deleted', condition: 'entry-locked', requestId: 3},
  ])
})


test('downloadModelToOPFS answers a held stale copy with an error instead of throwing', async () => {
  // The stale-commit branch: the found entry's name does not parse back to
  // the commit asked for (a commit string that itself contains the file
  // name is one way there).
  await lockedModelEntry('a.ifc', 'a.ifc.x')
  global.fetch = jest.fn()
  await worker.downloadModelToOPFS('https://x/a.ifc', 'a.ifc.x', 'a.ifc', 'owner', 'repo', 'main', false, 4)
  expect(self.postMessage.mock.calls.map(([m]) => m)).toEqual([
    {error: 'downloadModelToOPFS: a.ifc.a.ifc.x is open in an engine; not replaced', condition: 'entry-locked', requestId: 4},
  ])
  expect(global.fetch).not.toHaveBeenCalled()
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

// ------------------------------------------------------------
// Safari-shaped writes (no createWritable)
// ------------------------------------------------------------

/*
 * Safari implements OPFS writes ONLY through FileSystemSyncAccessHandle
 * (worker-only) — `FileSystemFileHandle.createWritable` is undefined
 * there. The stub above models Chrome by implementing both, which is
 * exactly how #1686 shipped green: every GLB cache write threw on Safari,
 * silently, because the writer is fail-soft. Pin the write paths against
 * a handle that lacks the method.
 */
describe('OPFS writes on a handle without createWritable (Safari)', () => {
  let savedCreateWritable

  beforeEach(() => {
    savedCreateWritable = FileHandle.prototype.createWritable
    delete FileHandle.prototype.createWritable
  })

  afterEach(() => {
    FileHandle.prototype.createWritable = savedCreateWritable
  })

  test('writeBytesByPathToOPFS writes the bytes and reports success', async () => {
    const bytes = new Uint8Array(Buffer.from('glb-artifact-bytes'))

    await worker.writeBytesByPathToOPFS(bytes, 'commit123', 'model.ifc', 'owner', 'repo', 'main')

    expect(self.postMessage).toHaveBeenCalledWith({completed: true, event: 'wrote', commitHash: 'commit123'})
    const dir = await (await (await rootDir.getDirectoryHandle('owner')).getDirectoryHandle('repo'))
      .getDirectoryHandle('main')
    const written = await dir.getFileHandle('model.ifc.null.commit123', {create: false})
    expect(await (await written.getFile()).text()).toBe('glb-artifact-bytes')
  })

  test('writeBytesByPathToOPFS stamps the request id on both success and failure', async () => {
    // The main-thread half of this contract is in `OPFS/utils.js`
    // (`workerRequest`): a reply without the id of the request that asked for
    // it is dropped, so an unstamped reply here would hang the caller rather
    // than settling someone else's promise (#1785).
    await worker.writeBytesByPathToOPFS(
      new Uint8Array([1, 2, 3]), 'commit123', 'model.ifc', 'owner', 'repo', 'main', 'opfs-7')
    expect(self.postMessage).toHaveBeenCalledWith(
      {completed: true, event: 'wrote', commitHash: 'commit123', requestId: 'opfs-7'})

    // The error branch matters most: error replies carry no commitHash, so the
    // id is the ONLY thing tying one to its request.
    self.postMessage.mockClear()
    navigator.storage.getDirectory.mockRejectedValueOnce(new Error('opfs unavailable'))
    await worker.writeBytesByPathToOPFS(
      new Uint8Array([1]), 'c1', 'model.ifc', 'owner', 'repo', 'main', 'opfs-8')
    expect(self.postMessage).toHaveBeenCalledWith(
      {error: 'writeBytesByPath: opfs unavailable', condition: 'write-failed', requestId: 'opfs-8'})
  })

  test('writeBytesByPathToOPFS truncates a longer previous entry', async () => {
    await worker.writeBytesByPathToOPFS(
      new Uint8Array(Buffer.from('the-long-original-payload')), 'c1', 'model.ifc', 'o', 'r', 'main')
    await worker.writeBytesByPathToOPFS(
      new Uint8Array(Buffer.from('short')), 'c1', 'model.ifc', 'o', 'r', 'main')

    const dir = await (await (await rootDir.getDirectoryHandle('o')).getDirectoryHandle('r'))
      .getDirectoryHandle('main')
    const written = await dir.getFileHandle('model.ifc.null.c1', {create: false})
    // No stale tail from the longer first write.
    expect(await (await written.getFile()).text()).toBe('short')
  })

  test('renameFileInOPFS copy fallback still copies when move is unavailable', async () => {
    const oldHandle = await rootDir.getFileHandle('safari-old.txt', {create: true})
    oldHandle.data = new Uint8Array(Buffer.from('safari-payload'))

    const newHandle = await worker.renameFileInOPFS(rootDir, oldHandle, 'safari-new.txt')

    expect(await (await newHandle.getFile()).text()).toBe('safari-payload')
    await expect(rootDir.getFileHandle('safari-old.txt', {create: false})).rejects.toThrow('not found')
  })

  /*
   * `openSyncAccessHandleWithRetry` recovers from Safari's
   * `InvalidStateError` by removing and RECREATING the entry, so the
   * handle passed in goes stale and the bytes land in a fresh one. The
   * copy must hand back the helper's handle, not the pre-retry object.
   */
  test('renameFileInOPFS copy fallback returns the handle the retry recreated', async () => {
    const src = await rootDir.getFileHandle('retry-src.txt', {create: true})
    src.data = new Uint8Array(Buffer.from('retry-payload'))

    const realGetFileHandle = rootDir.getFileHandle.bind(rootDir)
    let staleDest = null
    rootDir.getFileHandle = jest.fn(async (name, opts) => {
      const handle = await realGetFileHandle(name, opts)
      if (name === 'retry-dest.txt' && staleDest === null) {
        staleDest = handle
        // First sync-handle attempt on this entry fails the way Safari
        // does when it still holds an internal reference.
        // eslint-disable-next-line require-await
        handle.createSyncAccessHandle = jest.fn(async () => {
          throw new DOMException('The object is in an invalid state.', 'InvalidStateError')
        })
      }
      return handle
    })

    const dest = await worker.renameFileInOPFS(rootDir, src, 'retry-dest.txt')

    expect(dest).not.toBe(staleDest)
    expect(await (await dest.getFile()).text()).toBe('retry-payload')
  })

  test('renameFileInOPFS copy fallback spans multiple chunks', async () => {
    // Larger than COPY_CHUNK_BYTES (4MiB), so the slice loop runs more
    // than once — the chunking is the reason this path exists on iOS.
    // eslint-disable-next-line no-magic-numbers
    const BIG = (4 * 1024 * 1024) + 1024
    const src = await rootDir.getFileHandle('big.bin', {create: true})
    src.data = new Uint8Array(BIG).fill(7)

    const dest = await worker.renameFileInOPFS(rootDir, src, 'big-renamed.bin')

    const copied = new Uint8Array(await (await dest.getFile()).arrayBuffer())
    expect(copied.length).toBe(BIG)
    expect(copied.every((b) => b === 7)).toBe(true)
  })
})


/*
 * #2042: Chromium's FileSystemSyncAccessHandle.write() can fail without
 * throwing. Measured in an incognito profile past about 1 GB of OPFS, it
 * returned 4294967288 for every chunk while the file stopped growing. The
 * writers ignored that result and cached a truncated model as complete.
 * `storageFullAfter(n)` reproduces that handle: it writes the first `n`
 * bytes, then lands part of a chunk and returns the same bogus count from
 * there on.
 */
describe('OPFS writes that fail without throwing (#2042)', () => {
  const BOGUS_WRITE_RESULT = 4294967288
  const KIB = 1024
  const CHUNKS = 4
  // Storage fills partway through the third of the four 1 KiB chunks.
  const MID_THIRD_CHUNK = 2500
  const UPLOAD_BYTES = 1000
  const UPLOAD_LIMIT = 100
  const SMALL_BYTES = 64
  const SMALL_LIMIT = 16
  let savedCreateSyncAccessHandle
  let originalFetch

  beforeEach(() => {
    originalFetch = global.fetch
  })

  /**
   * @param {number} limit Bytes the "storage" accepts before writes start failing.
   */
  function storageFullAfter(limit) {
    savedCreateSyncAccessHandle = FileHandle.prototype.createSyncAccessHandle
    FileHandle.prototype.createSyncAccessHandle = async function() {
      const real = await savedCreateSyncAccessHandle.call(this)
      const fullWrite = real.write
      real.write = async (buffer, opts = {}) => {
        const arr = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer
        const at = opts.at || 0
        if (at + arr.length <= limit) {
          return fullWrite(buffer, opts)
        }
        if (at < limit) {
          await fullWrite(arr.subarray(0, limit - at), {at})
        }
        return BOGUS_WRITE_RESULT
      }
      return real
    }
  }

  afterEach(() => {
    if (savedCreateSyncAccessHandle) {
      FileHandle.prototype.createSyncAccessHandle = savedCreateSyncAccessHandle
      savedCreateSyncAccessHandle = null
    }
    // Restore, not delete: MSW's afterAll (tools/jest/setupTests.js) puts
    // back the fetch it patched, and throws if the property is gone, which
    // is the last thing a filtered run (`-t`) of these tests does.
    global.fetch = originalFetch
  })

  /**
   * @param {object} dir
   * @return {Promise<Array<string>>} Every file name under `dir`, recursively.
   */
  async function allFileNames(dir) {
    const names = []
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'file') {
        names.push(name)
      } else {
        names.push(...await allFileNames(handle))
      }
    }
    return names
  }

  /**
   * @param {number} chunks
   * @param {number} chunkBytes
   * @return {Response} A streamed response of `chunks` chunks of `chunkBytes` bytes.
   */
  function streamedResponse(chunks, chunkBytes) {
    let sent = 0
    const body = new ReadableStream({
      pull(controller) {
        if (sent === chunks) {
          controller.close()
          return
        }
        sent++
        controller.enqueue(new Uint8Array(chunkBytes).fill(sent))
      },
    })
    return new Response(body, {headers: {'Content-Length': String(chunks * chunkBytes)}})
  }

  test('writeAll returns the count when every byte lands', async () => {
    const handle = await new FileHandle('ok.bin').createSyncAccessHandle()
    await expect(worker.writeAll(handle, new Uint8Array(8), {at: 0})).resolves.toBe(8)
  })

  test('writeAll throws on a short or bogus write count', async () => {
    storageFullAfter(4)
    const handle = await new FileHandle('full.bin').createSyncAccessHandle()
    await expect(worker.writeAll(handle, new Uint8Array(8), {at: 0}))
      .rejects.toThrow('OPFS write incomplete: 4294967288 of 8 bytes at offset 0')
  })

  test('downloadModelToOPFS reports the failure and leaves no partial entry', async () => {
    storageFullAfter(MID_THIRD_CHUNK)
    global.fetch = jest.fn(() => Promise.resolve(streamedResponse(CHUNKS, KIB)))

    await worker.downloadModelToOPFS(
      'blob:x', 'bldrs-ai', 'big.ifc', 'BldrsLocalStorage', 'V1', 'Projects', false, 'opfs-1')

    const replies = self.postMessage.mock.calls.map(([m]) => m)
    expect(replies.some((m) => m.completed)).toBe(false)
    expect(replies.some((m) => /OPFS write incomplete/.test(String(m.error)))).toBe(true)
    // Before #2042 a partial `big.ifc.bldrs-ai` was left here, and the next
    // load took it for a cache hit.
    expect(await allFileNames(rootDir)).toEqual([])
  })

  test('downloadModelToOPFS still stores a download that fits', async () => {
    global.fetch = jest.fn(() => Promise.resolve(streamedResponse(CHUNKS, KIB)))

    await worker.downloadModelToOPFS(
      'blob:x', 'bldrs-ai', 'big.ifc', 'BldrsLocalStorage', 'V1', 'Projects', false, 'opfs-2')

    const done = self.postMessage.mock.calls.map(([m]) => m).find((m) => m.completed)
    expect(done.file.size).toBe(CHUNKS * KIB)
  })

  /*
   * Hosted and external models are keyed `<file>.<host>` (local paths
   * `<file>.bldrs-ai`), a key nothing ever invalidates, so any entry under
   * the final name is served as a hit (#2102). downloadModelToOPFS used to
   * create that entry before fetch(), so every way a download could stop
   * short left a 0-byte or partial entry there for good. These pin the
   * write-to-temp-then-move.
   */
  describe('downloadModelToOPFS never leaves an incomplete entry under the final name', () => {
    const args = ['BldrsLocalStorage', 'V1', 'Projects', false]
    const finalName = 'index.ifc.preview.example'

    /** @return {Promise<object>} the Projects dir handle */
    async function projectsDir() {
      return await (await (await rootDir.getDirectoryHandle('BldrsLocalStorage', {create: true}))
        .getDirectoryHandle('V1', {create: true})).getDirectoryHandle('Projects', {create: true})
    }

    /**
     * @param {string} path hosted path, e.g. '/index.ifc'
     * @param {string} requestId
     * @return {Promise<Array<object>>} the replies
     */
    async function download(path, requestId) {
      self.postMessage.mockClear()
      await worker.downloadModelToOPFS(
        `https://preview.example${path}`, 'preview.example', path, ...args, requestId)
      return self.postMessage.mock.calls.map(([m]) => m)
    }

    /**
     * Give the stub FileHandle the `move(directory, name)` every current
     * engine has for OPFS. Without it, the stub models one that lacks it.
     */
    function withMove() {
      FileHandle.prototype.move = async function(directory, name) {
        await Promise.resolve()
        // As OPFS does: an entry removed from under its handle can't move.
        if (this.parent.entriesMap.get(this.name) !== this) {
          throw new DOMException('entry is gone', 'NotFoundError')
        }
        this.parent.entriesMap.delete(this.name)
        this.name = name
        this.parent = directory
        directory.entriesMap.set(name, this)
      }
    }

    /**
     * A LockManager for one test. CI's Node has a global `navigator.locks`
     * and Node 20 has no `navigator` at all, so every test here pins it
     * (Share#2095 was bitten by both). Requests never contend in these
     * tests except through `ifAvailable`, so there is no queue.
     *
     * @return {object}
     */
    function fakeLocks() {
      const held = new Set()
      return {
        held,
        async request(name, optionsOrCallback, maybeCallback) {
          const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
          const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback
          if (held.has(name)) {
            if (options.ifAvailable) {
              return await callback(null)
            }
            throw new Error(`fakeLocks: ${name} is already held`)
          }
          held.add(name)
          try {
            return await callback({name})
          } finally {
            held.delete(name)
          }
        },
      }
    }

    beforeEach(() => {
      global.navigator.locks = undefined
    })

    afterEach(() => {
      delete FileHandle.prototype.move
    })

    test('a fetch that rejects creates nothing', async () => {
      global.fetch = jest.fn(() => Promise.reject(new TypeError('Failed to fetch')))

      const replies = await download('/index.ifc', 'r1')

      expect(replies.some((m) => m.completed)).toBe(false)
      expect(replies.some((m) => /fetch failed/.test(String(m.error)))).toBe(true)
      // The page reports this to Sentry from the reply's condition (the worker has no Sentry).
      expect(replies.find((m) => m.error).condition).toBe('fetch-rejected')
      expect(await allFileNames(rootDir)).toEqual([])
    })

    test('no failure reply names the file, its host or the engine error text', async () => {
      // utils.js logs these, and a console line that names a private model
      // reaches Sentry as a breadcrumb. Red if a path, host or the caught
      // error's own text (which engines may fill with the URL) comes back.
      withMove()
      const secretPath = '/secret-plan.ifc'
      const leaky = 'https://preview.example/secret-plan.ifc'
      const brokenBody = () => new ReadableStream({
        pull(controller) {
          controller.error(new TypeError(`network error ${leaky}`))
        },
      })
      const fetches = [
        () => Promise.reject(new TypeError(`Failed to fetch ${leaky}`)),
        () => Promise.resolve(new Response('nope', {status: 404})),
        () => Promise.resolve(streamedResponse(0, KIB)),
        () => Promise.resolve(new Response(brokenBody())),
      ]
      for (const [i, fetchImpl] of fetches.entries()) {
        global.fetch = jest.fn(fetchImpl)
        const replies = await download(secretPath, `leak${i}`)
        const failure = replies.find((m) => m.error)
        expect(failure).toBeDefined()
        expect(JSON.stringify(failure)).not.toMatch(/secret-plan|preview\.example/)
      }
    })

    test('an error response is not cached', async () => {
      global.fetch = jest.fn(() => Promise.resolve(new Response('<html>Not found</html>', {status: 404})))

      const replies = await download('/index.ifc', 'r2')

      expect(replies.some((m) => /HTTP 404/.test(String(m.error)))).toBe(true)
      expect(replies.find((m) => m.error)).toMatchObject({condition: 'http-error', status: 404})
      expect(await allFileNames(rootDir)).toEqual([])
    })

    test('an empty body is not cached', async () => {
      withMove()
      global.fetch = jest.fn(() => Promise.resolve(streamedResponse(0, KIB)))

      const replies = await download('/index.ifc', 'r3')

      expect(replies.some((m) => m.completed)).toBe(false)
      expect(replies.some((m) => /empty response body/.test(String(m.error)))).toBe(true)
      expect(replies.find((m) => m.error).condition).toBe('empty-body')
      expect(await allFileNames(rootDir)).toEqual([])
    })

    test('a stream that dies mid-download leaves nothing', async () => {
      withMove()
      let sent = 0
      const body = new ReadableStream({
        pull(controller) {
          if (sent++ === 2) {
            controller.error(new TypeError('network error'))
            return
          }
          controller.enqueue(new Uint8Array(KIB).fill(sent))
        },
      })
      global.fetch = jest.fn(() => Promise.resolve(new Response(body)))

      const replies = await download('/index.ifc', 'r4')

      expect(replies.some((m) => m.completed)).toBe(false)
      expect(replies.find((m) => m.error).condition).toBe('stream-error')
      expect(await allFileNames(rootDir)).toEqual([])
    })

    test('the final name appears only once every byte has landed', async () => {
      // A reload or tab close mid-download leaves whatever exists at that
      // moment, and no cleanup runs. That must never be the final name.
      withMove()
      const seenMidStream = []
      let sent = 0
      const body = new ReadableStream({
        async pull(controller) {
          if (sent === CHUNKS) {
            controller.close()
            return
          }
          seenMidStream.push(await allFileNames(rootDir))
          sent++
          controller.enqueue(new Uint8Array(KIB).fill(sent))
        },
      })
      global.fetch = jest.fn(() => Promise.resolve(new Response(body)))

      const replies = await download('/index.ifc', 'r5')

      // From the second pull on, the temp exists; the final name never does.
      expect(seenMidStream.slice(1).every((names) => names.length === 1)).toBe(true)
      expect(seenMidStream.flat()).not.toContain(finalName)
      const done = replies.find((m) => m.completed)
      expect(done.event).toBe('download')
      expect(done).not.toHaveProperty('cached')
      expect(done.file.size).toBe(CHUNKS * KIB)
      expect(await allFileNames(rootDir)).toEqual([finalName])
      // ...and the next load is a hit, with no fetch.
      global.fetch.mockClear()
      expect((await download('/index.ifc', 'r5b')).find((m) => m.completed).event).toBe('exists')
      expect(global.fetch).not.toHaveBeenCalled()
    })

    test('a model whose name looks like a temp is never touched by another download', async () => {
      // A hosted `/.partial-model.glb` is a legitimate name, and it was
      // exactly what `/model.glb`'s temp used to be called.
      withMove()
      const dir = await projectsDir()
      const other = await dir.getFileHandle('.partial-model.glb.preview.example', {create: true})
      other.data = new Uint8Array(Buffer.from('a different model'))
      global.fetch = jest.fn(() => Promise.resolve(streamedResponse(CHUNKS, KIB)))

      await download('/model.glb', 'r6')

      const kept = await dir.getFileHandle('.partial-model.glb.preview.example', {create: false})
      expect(await (await kept.getFile()).text()).toBe('a different model')
      expect((await (await dir.getFileHandle('model.glb.preview.example', {create: false})).getFile()).size)
        .toBe(CHUNKS * KIB)
    })

    /** @return {Promise<Array<string>>} what is in the temp directory */
    async function listTemps() {
      try {
        return await allFileNames(await rootDir.getDirectoryHandle(worker.PARTIAL_DOWNLOAD_DIR))
      } catch (_) {
        return []
      }
    }

    test('without move(), the final name is never created and the model is served from the temp', async () => {
      global.fetch = jest.fn(() => Promise.resolve(streamedResponse(CHUNKS, KIB)))
      const dir = await projectsDir()
      const getFileHandle = jest.spyOn(dir, 'getFileHandle')

      const replies = await download('/index.ifc', 'r7')

      const done = replies.find((m) => m.completed)
      expect(done.event).toBe('download')
      // Tells the page to count it (reportOpfsNotCached); a cached download omits it.
      expect(done.cached).toBe(false)
      expect(new Uint8Array(await done.file.arrayBuffer())).toEqual(
        new Uint8Array(await streamedResponse(CHUNKS, KIB).arrayBuffer()))
      // A copy would have created the final name before it was complete.
      expect(getFileHandle).not.toHaveBeenCalledWith(finalName, {create: true})
      // Nothing under the final name: the one entry is the live temp.
      const names = await allFileNames(rootDir)
      expect(names).toHaveLength(1)
      expect(names).not.toContain(finalName)
      expect(await listTemps()).toEqual(names)
    })

    test('without move(), the reply is the temp\'s own File and the bytes are never buffered', async () => {
      // Reading the temp into an ArrayBuffer needs one contiguous allocation
      // the size of the model (codex review of Share#2103). Red if the reply
      // goes back to arrayBuffer() + a copied File.
      const files = []
      const getFile = FileHandle.prototype.getFile
      FileHandle.prototype.getFile = async function() {
        const file = await getFile.call(this)
        file.arrayBuffer = jest.fn(() => file.slice().arrayBuffer())
        files.push(file)
        return file
      }
      try {
        global.fetch = jest.fn(() => Promise.resolve(streamedResponse(CHUNKS, KIB)))

        const replies = await download('/index.ifc', 'r7a')

        const done = replies.find((m) => m.completed)
        expect(files).toContain(done.file)
        expect(files.some((file) => file.arrayBuffer.mock.calls.length > 0)).toBe(false)
        expect(done.file.size).toBe(CHUNKS * KIB)
        // The temp is still there for the page to read.
        expect(await listTemps()).toHaveLength(1)
      } finally {
        FileHandle.prototype.getFile = getFile
      }
    })

    test('with Web Locks, another download\'s sweep leaves a served no-move temp, and its lock stays held', async () => {
      const locks = fakeLocks()
      global.navigator.locks = locks
      global.fetch = jest.fn(() => Promise.resolve(streamedResponse(CHUNKS, KIB)))

      await download('/a.ifc', 'r7b')
      const [served] = await listTemps()
      expect(locks.held.has(`${worker.PARTIAL_DOWNLOAD_LOCK_PREFIX}${served}`)).toBe(true)

      // A second download in the same worker sweeps first.
      await download('/b.ifc', 'r7c')

      expect(await listTemps()).toContain(served)
    })

    test('without Web Locks, this worker\'s own sweep leaves a served no-move temp even past 10 minutes', async () => {
      // Only the age rule runs here. A temp still being read must not be
      // taken for abandoned just because its last write was long ago.
      global.fetch = jest.fn(() => Promise.resolve(streamedResponse(CHUNKS, KIB)))
      await download('/a.ifc', 'r7d')
      const temps = await rootDir.getDirectoryHandle(worker.PARTIAL_DOWNLOAD_DIR)
      const [served] = await listTemps()
      const handle = await temps.getFileHandle(served)
      handle.lastModified = Date.now() - worker.STALE_PARTIAL_DOWNLOAD_MS - 1

      await download('/b.ifc', 'r7e')

      expect(await listTemps()).toContain(served)
    })

    test('a temp that cannot be opened cancels the fetched body and caches nothing', async () => {
      // Safari can refuse createSyncAccessHandle. The Loader then fetches the
      // model again directly, so the first response must not stay open.
      withMove()
      savedCreateSyncAccessHandle = FileHandle.prototype.createSyncAccessHandle
      FileHandle.prototype.createSyncAccessHandle = () =>
        Promise.reject(new DOMException('no handle', 'NoModificationAllowedError'))
      const cancel = jest.fn()
      const body = new ReadableStream({
        pull(controller) {
          controller.enqueue(new Uint8Array(KIB))
        },
        cancel,
      })
      global.fetch = jest.fn(() => Promise.resolve(new Response(body)))

      const replies = await download('/index.ifc', 'rCancel')

      expect(replies.some((m) => m.completed)).toBe(false)
      expect(replies.some((m) => m.error)).toBe(true)
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(await allFileNames(rootDir)).toEqual([])
    })

    test('a copy killed partway never becomes a cache hit', async () => {
      // A worker or tab killed mid-copy runs no cleanup. Model that: every
      // write to a file under the final name dies, and so does its removal.
      // The copy used to create that name first, so the 0-byte copy it left
      // was served as 'exists' on the next load.
      savedCreateSyncAccessHandle = FileHandle.prototype.createSyncAccessHandle
      FileHandle.prototype.createSyncAccessHandle = async function() {
        const real = await savedCreateSyncAccessHandle.call(this)
        if (this.name === finalName) {
          this.remove = () => Promise.reject(new Error('killed'))
          real.write = () => Promise.reject(new Error('killed mid-copy'))
        }
        return real
      }
      const dir = await projectsDir()
      const removeEntry = dir.removeEntry.bind(dir)
      dir.removeEntry = (name) => name === finalName ? Promise.reject(new Error('killed')) : removeEntry(name)
      global.fetch = jest.fn(() => Promise.resolve(streamedResponse(CHUNKS, KIB)))

      await download('/index.ifc', 'r8')
      const replies = await download('/index.ifc', 'r8b')

      expect(replies.some((m) => m.event === 'exists')).toBe(false)
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    test('a download still in progress keeps its temp through another download\'s sweep', async () => {
      // Its temp can be between getFileHandle and createSyncAccessHandle,
      // or between close and move, with no file lock on it. Only its Web
      // Lock says it is live (codex review of Share#2103).
      withMove()
      global.navigator.locks = fakeLocks()
      let release
      const gate = new Promise((resolve) => {
        release = resolve
      })
      let sent = 0
      const slowBody = new ReadableStream({
        async pull(controller) {
          if (sent === 2) {
            await gate
          }
          if (sent === CHUNKS) {
            controller.close()
            return
          }
          sent++
          controller.enqueue(new Uint8Array(KIB).fill(sent))
        },
      })
      global.fetch = jest.fn((url) => Promise.resolve(
        url.endsWith('/a.ifc') ? new Response(slowBody) : streamedResponse(CHUNKS, KIB)))
      const tempNames = async () => {
        try {
          return await allFileNames(await rootDir.getDirectoryHandle(worker.PARTIAL_DOWNLOAD_DIR))
        } catch (_) {
          return []
        }
      }

      const first = worker.downloadModelToOPFS(
        'https://preview.example/a.ifc', 'preview.example', '/a.ifc', ...args, 'a')
      const MAX_TICKS = 100
      for (let i = 0; i < MAX_TICKS && sent < 2; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      const [liveTemp] = await tempNames()
      expect(liveTemp).toBeDefined()

      await download('/b.ifc', 'b')

      expect(await tempNames()).toEqual([liveTemp])
      release()
      await first
      const dir = await projectsDir()
      for (const name of ['a.ifc.preview.example', 'b.ifc.preview.example']) {
        expect((await (await dir.getFileHandle(name, {create: false})).getFile()).size).toBe(CHUNKS * KIB)
      }
      expect(await tempNames()).toEqual([])
    })

    test('with Web Locks, an abandoned temp is swept and a locked one is not', async () => {
      withMove()
      const locks = fakeLocks()
      global.navigator.locks = locks
      const temps = await rootDir.getDirectoryHandle(worker.PARTIAL_DOWNLOAD_DIR, {create: true})
      const stale = await temps.getFileHandle('stale', {create: true})
      stale.data = new Uint8Array(10 * KIB).fill(9)
      await temps.getFileHandle('held', {create: true})
      // Another tab's download, mid-write.
      locks.held.add(`${worker.PARTIAL_DOWNLOAD_LOCK_PREFIX}held`)
      global.fetch = jest.fn(() => Promise.resolve(streamedResponse(CHUNKS, KIB)))

      const replies = await download('/index.ifc', 'r9')

      const done = replies.find((m) => m.completed)
      expect(done.file.size).toBe(CHUNKS * KIB)
      expect(new Uint8Array(await done.file.arrayBuffer()).includes(9)).toBe(false)
      expect((await allFileNames(rootDir)).sort()).toEqual(['held', finalName])
    })

    test('without Web Locks, only a temp unwritten for 10 minutes is swept', async () => {
      withMove()
      const temps = await rootDir.getDirectoryHandle(worker.PARTIAL_DOWNLOAD_DIR, {create: true})
      const old = await temps.getFileHandle('old', {create: true})
      old.lastModified = Date.now() - worker.STALE_PARTIAL_DOWNLOAD_MS - 1
      const recent = await temps.getFileHandle('recent', {create: true})
      const A_SECOND_MS = 1000
      recent.lastModified = Date.now() - A_SECOND_MS
      global.fetch = jest.fn(() => Promise.resolve(streamedResponse(CHUNKS, KIB)))

      await download('/index.ifc', 'r9b')

      expect((await allFileNames(rootDir)).sort()).toEqual([finalName, 'recent'])
    })

    test('a complete entry is served without a fetch', async () => {
      const dir = await projectsDir()
      const entry = await dir.getFileHandle(finalName, {create: true})
      entry.data = new Uint8Array(KIB).fill(1)
      global.fetch = jest.fn()

      const replies = await download('/index.ifc', 'r10')

      expect(global.fetch).not.toHaveBeenCalled()
      expect(replies.find((m) => m.completed).event).toBe('exists')
    })
  })

  test('writeModelToOPFSFromFile (an upload) reports the failure and leaves no partial entry', async () => {
    storageFullAfter(UPLOAD_LIMIT)
    const upload = new File([new Uint8Array(UPLOAD_BYTES).fill(3)], 'model.ifc')

    await worker.writeModelToOPFSFromFile(
      upload, 'obj-1', 'model.ifc', 'BldrsLocalStorage', 'V1', 'Projects', 'opfs-3')

    const replies = self.postMessage.mock.calls.map(([m]) => m)
    expect(replies.some((m) => m.completed)).toBe(false)
    expect(replies.some((m) => /OPFS write incomplete/.test(String(m.error)))).toBe(true)
    expect(await allFileNames(rootDir)).toEqual([])
  })

  test('writeBytesByPathToOPFS reports the failure and leaves no partial entry', async () => {
    storageFullAfter(SMALL_LIMIT)

    await worker.writeBytesByPathToOPFS(new Uint8Array(SMALL_BYTES), 'c1', 'model.glb', 'o', 'r', 'main', 'opfs-4')

    expect(self.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('OPFS write incomplete'), requestId: 'opfs-4'}))
    expect(await allFileNames(rootDir)).toEqual([])
  })

  test('renameFileInOPFS copy fallback keeps the source when the copy is cut short', async () => {
    const src = await rootDir.getFileHandle('src.bin', {create: true})
    src.data = new Uint8Array(SMALL_BYTES).fill(9)
    storageFullAfter(SMALL_LIMIT)

    await expect(worker.renameFileInOPFS(rootDir, src, 'dest.bin')).rejects.toThrow('OPFS write incomplete')

    // Before #2042, the truncate after the copy zero-filled the copy to full
    // size and it replaced the source.
    expect(await allFileNames(rootDir)).toEqual(['src.bin'])
    expect(src.data.every((b) => b === 9)).toBe(true)
  })
})


// ------------------------------------------------------------
// fetchLatestCommitHash tests
// ------------------------------------------------------------

test('fetchLatestCommitHash returns hash and date on success', async () => {
  const ISO_DATE = '2022-09-22T10:30:27Z'
  const commits = [{sha: 'abc123', commit: {author: {date: ISO_DATE}}}]
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue(commits),
  })

  const result = await worker.fetchLatestCommitHash(
    'https://api.github.com', 'owner', 'repo', 'model.ifc', '', 'main',
  )

  expect(result.hash).toBe('abc123')
  expect(result.date).toBe(new Date(ISO_DATE).getTime())
})

test('fetchLatestCommitHash throws when response is not ok', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    statusText: 'Not Found',
    json: jest.fn().mockResolvedValue([]),
  })

  await expect(
    worker.fetchLatestCommitHash('https://api.github.com', 'owner', 'repo', 'model.ifc', '', 'main'),
  ).rejects.toThrow('Failed to fetch commits')
})

test('fetchLatestCommitHash throws when no commits returned', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue([]),
  })

  await expect(
    worker.fetchLatestCommitHash('https://api.github.com', 'owner', 'repo', 'model.ifc', '', 'main'),
  ).rejects.toThrow('No commits found')
})


// ------------------------------------------------------------
// postFinalDownloadEventAfterRename tests
//
// Helper underlies the Safari rename-race fix: rename the OPFS entry BEFORE
// posting the File so the caller's `.arrayBuffer()` doesn't fault on an
// invalidated blob backing. Three paths to cover: rename success, commits-
// API failure (fallback to original handle), and rename failure (same
// fallback, different cause).
// ------------------------------------------------------------

test('postFinalDownloadEventAfterRename posts `renamed` with the post-rename file on success', async () => {
  const ISO_DATE = '2022-09-22T10:30:27Z'
  const EPOCH_MS = new Date(ISO_DATE).getTime()
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue([{sha: 'commit123', commit: {author: {date: ISO_DATE}}}]),
  })

  const fileHandle = await rootDir.getFileHandle('model.ifc.sha1.temporary', {create: true})
  fileHandle.data = new Uint8Array(Buffer.from('hello'))

  await worker.postFinalDownloadEventAfterRename(
    rootDir, fileHandle,
    'model.ifc', 'sha1', 'cacheKey',
    'owner', 'repo', 'main', '', null,
  )

  // The point of the helper: hand back the POST-rename File, with the commit
  // date attached. Pre-fix we posted the pre-rename File which Safari then
  // invalidated on the rename.
  expect(self.postMessage).toHaveBeenCalledTimes(1)
  const msg = self.postMessage.mock.calls[0][0]
  expect(msg.completed).toBe(true)
  expect(msg.event).toBe('renamed')
  expect(msg.file).toBeInstanceOf(File)
  expect(msg.file.name).toBe('model.ifc.sha1.commit123')
  expect(msg.lastModifiedGithub).toBe(EPOCH_MS)
})

test('postFinalDownloadEventAfterRename falls back to `download` with the original file when commits API fails', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    statusText: 'Forbidden',
    json: jest.fn().mockResolvedValue([]),
  })

  const fileHandle = await rootDir.getFileHandle('model.ifc.sha1.temporary', {create: true})
  fileHandle.data = new Uint8Array(Buffer.from('hello'))
  const FALLBACK_MS = 1234567890000

  await worker.postFinalDownloadEventAfterRename(
    rootDir, fileHandle,
    'model.ifc', 'sha1', 'cacheKey',
    'owner', 'repo', 'main', '', FALLBACK_MS,
  )

  // We resolve with the un-renamed file so the load completes; user just
  // doesn't get commit-pinning on this load. The lastModified falls back to
  // whatever the cache gave us (callers pass it from the cache headers).
  expect(self.postMessage).toHaveBeenCalledTimes(1)
  const msg = self.postMessage.mock.calls[0][0]
  expect(msg.completed).toBe(true)
  expect(msg.event).toBe('download')
  expect(msg.file).toBeInstanceOf(File)
  expect(msg.file.name).toBe('model.ifc.sha1.temporary')
  expect(msg.lastModifiedGithub).toBe(FALLBACK_MS)
})

test('postFinalDownloadEventAfterRename falls back to `download` when rename throws', async () => {
  const ISO_DATE = '2022-09-22T10:30:27Z'
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue([{sha: 'commit123', commit: {author: {date: ISO_DATE}}}]),
  })

  const fileHandle = await rootDir.getFileHandle('model.ifc.sha1.temporary', {create: true})
  fileHandle.data = new Uint8Array(Buffer.from('hello'))
  // Force the rename path to throw — `renameFileInOPFS` prefers `move()` when
  // available; an unconditional throw exercises the helper's outer catch.
  // eslint-disable-next-line require-await
  fileHandle.move = jest.fn(async () => {
    throw new Error('move blew up')
  })
  // Block the stream-copy fallback too, so `renameFileInOPFS` raises.
  // eslint-disable-next-line require-await
  rootDir.getFileHandle = jest.fn(async (name, opts) => {
    if (name === 'model.ifc.sha1.commit123' && opts && opts.create === true) {
      throw new Error('cannot create destination')
    }
    throw new Error('not found')
  })

  await worker.postFinalDownloadEventAfterRename(
    rootDir, fileHandle,
    'model.ifc', 'sha1', 'cacheKey',
    'owner', 'repo', 'main', '', null,
  )

  expect(self.postMessage).toHaveBeenCalledTimes(1)
  const msg = self.postMessage.mock.calls[0][0]
  expect(msg.event).toBe('download')
  // Fallback File comes from the ORIGINAL handle, not the (failed) rename.
  expect(msg.file).toBeInstanceOf(File)
  expect(msg.file.name).toBe('model.ifc.sha1.temporary')
})
