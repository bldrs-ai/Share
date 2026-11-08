/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
/* eslint-disable no-magic-numbers, require-await */
import {EngineSession} from './EngineSession'
import {createEngineHandler} from './engineHandler'
import {indexLine} from './engineModelLoad'
import {
  SIDECAR_DIR, STALE_TMP_MS, TMP_LOCK_PREFIX, discardSidecar, readSidecar, sidecarKey, sidecarWriter, sweepSidecars,
  writeSidecar, writeThroughSyncHandle,
} from './engineSidecars'
import {locateOpfsEntry, makeBlobStore, makeSyncHandleStore, openSourceStore} from './engineSources'
import {ENGINE_PROTOCOL_VERSION, Ev} from './protocol'
import {makeWorkerTransport} from './transports'


// engine-worker.md §7 step 8, §11 (conway#756, #757): the engine worker
// reopens a model from the index sidecar a previous open saved, so the
// reopen skips the parse — for IFC and STEP alike — and both of its stores
// read synchronously, which is what a windowed STEP open needs.

jest.mock('../loader/loadProgress', () => ({
  reportEngineLog: jest.fn(),
  reportEngineVersion: jest.fn(),
  reportSourceInfo: jest.fn(),
}))


const BYTES = Uint8Array.from({length: 64}, (_, i) => i)
const NAME = 'logo.step.etag.commit'
const MTIME = 1_700_000_000_000


/** @return {File} the snapshot OPFS.worker.js hands the page for the entry */
function snapshot() {
  return new File([BYTES], NAME, {lastModified: MTIME})
}


/**
 * A writable in-memory OPFS directory: what sidecars are read from and
 * written to, and what the source entry is found in.
 *
 * @param {object} [children] name → file entry or directory
 * @param {object} [options]
 * @param {boolean} [options.writable] false: the files it creates have no
 *   `createWritable`, as in Safari before 26 (Share#2093)
 * @return {object} a FileSystemDirectoryHandle stand-in
 */
function memoryDir(children = {}, {writable = true} = {}) {
  const dir = {
    kind: 'directory',
    children,
    async* entries() {
      for (const entry of Object.entries(dir.children)) {
        yield entry
      }
    },
    async getDirectoryHandle(name, {create = false} = {}) {
      if (!dir.children[name]) {
        if (!create) {
          throw Object.assign(new Error(name), {name: 'NotFoundError'})
        }
        dir.children[name] = memoryDir({}, {writable})
      }
      return dir.children[name]
    },
    async getFileHandle(name, {create = false} = {}) {
      if (!dir.children[name]) {
        if (!create) {
          throw Object.assign(new Error(name), {name: 'NotFoundError'})
        }
        dir.children[name] = memoryFile(name, new Uint8Array(0), {writable})
      }
      dir.children[name].parent = dir
      return dir.children[name]
    },
    async removeEntry(name) {
      if (!dir.children[name]) {
        throw Object.assign(new Error(name), {name: 'NotFoundError'})
      }
      delete dir.children[name]
    },
  }
  return dir
}


/**
 * @param {string} name
 * @param {Uint8Array} bytes
 * @param {object} [options]
 * @param {number} [options.lastModified]
 * @param {boolean} [options.writable] false drops `createWritable`
 * @return {object} a FileSystemFileHandle stand-in, with a sync access
 *   handle — read-only for a source entry, read-write (writing in place, as
 *   the real one does) for the Safari sidecar writer
 */
function memoryFile(name, bytes, {lastModified = MTIME, writable = true} = {}) {
  const file = {
    kind: 'file',
    name,
    bytes,
    parent: null,
    getFile: async () => new File([file.bytes], file.name, {lastModified}),
    async createWritable() {
      const parts = []
      return {
        write: async (chunk) => parts.push(new Uint8Array(chunk)),
        close: async () => {
          file.bytes = new Uint8Array(await new Blob(parts).arrayBuffer())
        },
        abort: async () => null,
      }
    },
    async createSyncAccessHandle(options) {
      return {
        mode: options?.mode === 'read-only' ? 'read-only' : 'readwrite',
        getSize: () => file.bytes.length,
        read: (into, {at}) => {
          const n = Math.max(0, Math.min(into.length, file.bytes.length - at))
          into.set(file.bytes.subarray(at, at + n))
          return n
        },
        truncate: (size) => {
          file.bytes = file.bytes.slice(0, size)
        },
        write: (from, {at}) => {
          const grown = new Uint8Array(Math.max(file.bytes.length, at + from.length))
          grown.set(file.bytes)
          grown.set(from, at)
          file.bytes = grown
          return from.length
        },
        flush: () => null,
        close: () => null,
      }
    },
    async move(dir, newName) {
      delete file.parent.children[file.name]
      dir.children[newName] = file
      file.parent = dir
      file.name = newName
    },
  }
  if (!writable) {
    delete file.createWritable
  }
  return file
}


// writeSidecar picks its writer off the FileSystemFileHandle prototype
// (engineSidecars.js#sidecarWriter), which node lacks: a dedicated worker's
// in Chromium or Firefox, and Safari's before 26, which has no
// createWritable (Share#2093).
/** A Chromium or Firefox worker's FileSystemFileHandle. */
class WorkerFileHandle {
  /** @return {null} stub */
  createWritable() {
    return null
  }
  /** @return {null} stub */
  createSyncAccessHandle() {
    return null
  }
}
/** Safari 17's worker FileSystemFileHandle. */
class Safari17WorkerFileHandle {
  /** @return {null} stub */
  createSyncAccessHandle() {
    return null
  }
}


/**
 * A `navigator.locks` stand-in: exclusive locks by name, with `ifAvailable`.
 *
 * @return {object} `{request, held}`
 */
function fakeLocks() {
  const held = new Set()
  return {
    held,
    async request(name, options, callback) {
      const [opts, cb] = typeof options === 'function' ? [{}, options] : [options, callback]
      if (held.has(name)) {
        if (opts.ifAvailable) {
          return cb(null)
        }
        throw new Error(`fakeLocks: ${name} is held and this stand-in does not queue`)
      }
      held.add(name)
      try {
        return await cb({name, mode: 'exclusive'})
      } finally {
        held.delete(name)
      }
    },
  }
}


/** @param {Function} FileHandle installed as the global for one test */
function useFileHandle(FileHandle) {
  globalThis.FileSystemFileHandle = FileHandle
}


/**
 * Install `locks` as the global `navigator.locks` for one test, which is what
 * the sweep and the sync-handle writer read when not handed one. Shadows
 * whatever the runtime has, as an own property of `navigator`: Node 24
 * ships Web Locks (CI), older Node and jsdom do not, and a sweep's verdict on
 * a fresh temporary differs between the two (the lock path removes it when
 * free, the age fallback keeps it). So every test here states which it gets.
 *
 * @param {object|undefined} locks a lock manager, or undefined for none
 */
function useWebLocks(locks) {
  Object.defineProperty(globalThis.navigator, 'locks', {value: locks, configurable: true, writable: true})
}


// No Web Locks unless a test installs some: the age fallback decides.
beforeEach(() => {
  useFileHandle(WorkerFileHandle)
  useWebLocks(undefined)
})
afterEach(() => {
  delete globalThis.FileSystemFileHandle
  // The own property goes; the runtime's own `locks`, if any, shows again.
  delete globalThis.navigator.locks
})


describe('engine/engineSidecars', () => {
  it('keys a sidecar by the entry\'s path alone: one slot per entry, whatever its version', async () => {
    const key = await sidecarKey('owner/repo/main/logo.step')
    expect(key).toMatch(/^[0-9a-f]{64}\.cidx$/)
    expect(await sidecarKey('owner/repo/main/logo.step')).toBe(key)
    expect(await sidecarKey('owner/repo/other/logo.step')).not.toBe(key)
  })

  it('writes, reads back, replaces and discards a sidecar in its own directory', async () => {
    const root = memoryDir()
    const getOpfsRoot = async () => root
    const PATH = 'owner/repo/logo.step'
    expect(await readSidecar(PATH, snapshot(), getOpfsRoot)).toBeNull()
    expect(await writeSidecar(PATH, snapshot(), Uint8Array.of(1, 2, 3), getOpfsRoot))
      .toEqual({saved: true, writer: 'writable', error: null})
    expect(Object.keys(root.children)).toEqual([SIDECAR_DIR])
    expect(Array.from(await readSidecar(PATH, snapshot(), getOpfsRoot))).toEqual([1, 2, 3])
    expect((await writeSidecar(PATH, snapshot(), Uint8Array.of(9), getOpfsRoot)).saved).toBe(true)
    expect(Array.from(await readSidecar(PATH, snapshot(), getOpfsRoot))).toEqual([9])
    await discardSidecar(PATH, getOpfsRoot)
    expect(await readSidecar(PATH, snapshot(), getOpfsRoot)).toBeNull()
    // Discarding what is not there is not an error.
    await discardSidecar(PATH, getOpfsRoot)
  })

  it('a failed write reports why and leaves the previous sidecar', async () => {
    const root = memoryDir()
    const getOpfsRoot = async () => root
    const PATH = 'owner/logo.step'
    await writeSidecar(PATH, snapshot(), Uint8Array.of(7), getOpfsRoot)
    const slot = root.children[SIDECAR_DIR].children[await sidecarKey(PATH)]
    slot.createWritable = async () => ({
      write: async () => {
        throw new Error('quota')
      },
      close: async () => null,
      abort: async () => null,
    })
    expect(await writeSidecar(PATH, snapshot(), Uint8Array.of(1), getOpfsRoot))
      .toEqual({saved: false, writer: 'writable', error: 'Error: quota'})
    expect(Array.from(await readSidecar(PATH, snapshot(), getOpfsRoot))).toEqual([7])
  })

  it('picks its writer off the prototype: createWritable, else a sync access handle, else none', () => {
    expect(sidecarWriter(WorkerFileHandle)).toBe('writable')
    expect(sidecarWriter(Safari17WorkerFileHandle)).toBe('syncAccessHandle')
    // A Safari 17 page: no createWritable, and no sync access handles off a worker.
    expect(sidecarWriter(class {})).toBeNull()
    expect(sidecarWriter(null)).toBeNull()
  })

  it('without createWritable (Safari before 26) it writes through a sync access handle, under the real name only', async () => {
    // Share#2093: Safari 17 reported "parsed; no sidecar saved" on every load.
    useFileHandle(Safari17WorkerFileHandle)
    const root = memoryDir({}, {writable: false})
    const getOpfsRoot = async () => root
    const PATH = 'owner/repo/PSB.ifc'
    expect(await writeSidecar(PATH, snapshot(), Uint8Array.of(1, 2, 3), getOpfsRoot))
      .toEqual({saved: true, writer: 'syncAccessHandle', error: null})
    expect(Object.keys(root.children[SIDECAR_DIR].children)).toEqual([await sidecarKey(PATH)])
    expect(Array.from(await readSidecar(PATH, snapshot(), getOpfsRoot))).toEqual([1, 2, 3])
    // A shorter replacement reads back whole, with nothing of the old one.
    expect((await writeSidecar(PATH, snapshot(), Uint8Array.of(9), getOpfsRoot)).saved).toBe(true)
    expect(Array.from(await readSidecar(PATH, snapshot(), getOpfsRoot))).toEqual([9])
    expect(Object.keys(root.children[SIDECAR_DIR].children)).toEqual([await sidecarKey(PATH)])
  })

  it('a first sync-handle save creates nothing under the real name before its move', async () => {
    // codex review of Share#2095: a `{create: true}` probe for the writer put
    // an empty file under the real name, which another tab read as a
    // truncated sidecar and a killed worker left behind.
    useFileHandle(Safari17WorkerFileHandle)
    const root = memoryDir({}, {writable: false})
    const getOpfsRoot = async () => root
    const PATH = 'owner/PSB.ifc'
    const key = await sidecarKey(PATH)
    await root.getDirectoryHandle(SIDECAR_DIR, {create: true})
    const dir = root.children[SIDECAR_DIR]
    const seen = []
    const getFileHandle = dir.getFileHandle.bind(dir)
    dir.getFileHandle = async (name, options) => {
      const handle = await getFileHandle(name, options)
      const open = handle.createSyncAccessHandle.bind(handle)
      handle.createSyncAccessHandle = async () => {
        const access = await open()
        return {...access, write: (from, at) => {
          seen.push(`write ${name === key ? 'real' : 'tmp'}, real name ${key in dir.children ? 'present' : 'absent'}`)
          return access.write(from, at)
        }}
      }
      return handle
    }
    expect((await writeSidecar(PATH, snapshot(), Uint8Array.of(1), getOpfsRoot)).saved).toBe(true)
    expect(seen).toEqual(['write tmp, real name absent'])
    expect(Object.keys(dir.children)).toEqual([key])
  })

  it('two writers never share a temporary', async () => {
    const dir = memoryDir({}, {writable: false})
    const names = []
    const getFileHandle = dir.getFileHandle.bind(dir)
    dir.getFileHandle = async (name, options) => {
      names.push(name)
      return getFileHandle(name, options)
    }
    await writeThroughSyncHandle(dir, 'a.cidx', Uint8Array.of(1))
    await writeThroughSyncHandle(dir, 'a.cidx', Uint8Array.of(2))
    expect(names).toHaveLength(2)
    expect(names[0]).not.toBe(names[1])
    expect(names.every((name) => name.startsWith('a.cidx.') && name.endsWith('.tmp'))).toBe(true)
  })

  it('a writer holds its temporary\'s lock from before it is created until after its move', async () => {
    const locks = fakeLocks()
    const dir = memoryDir({}, {writable: false})
    const seen = []
    const getFileHandle = dir.getFileHandle.bind(dir)
    dir.getFileHandle = async (name, options) => {
      seen.push(`create, held ${Array.from(locks.held).join()}`)
      const handle = await getFileHandle(name, options)
      const move = handle.move.bind(handle)
      handle.move = async (to, newName) => {
        seen.push(`move, held ${Array.from(locks.held).join()}`)
        return move(to, newName)
      }
      return handle
    }
    await writeThroughSyncHandle(dir, 'a.cidx', Uint8Array.of(1), locks)
    const tmpName = seen[0].match(/held bldrs-sidecar-tmp:(.*)$/)?.[1]
    expect(tmpName).toMatch(/^a\.cidx\..+\.tmp$/)
    expect(seen).toEqual([`create, held ${TMP_LOCK_PREFIX}${tmpName}`, `move, held ${TMP_LOCK_PREFIX}${tmpName}`])
    expect(locks.held.size).toBe(0)
  })

  it('with Web Locks the sweep removes a temporary only when its lock is free, whatever its age', async () => {
    const locks = fakeLocks()
    const root = memoryDir({owner: memoryDir({[NAME]: memoryFile(NAME, BYTES)})})
    const getOpfsRoot = async () => root
    await writeSidecar(`owner/${NAME}`, snapshot(), Uint8Array.of(1), getOpfsRoot)
    const dir = root.children[SIDECAR_DIR]
    const kept = dir.children[await sidecarKey(`owner/${NAME}`)]
    const NOW = MTIME + (2 * STALE_TMP_MS)
    // Stale but held: a writer suspended between its close and its move.
    dir.children['held.cidx.1.tmp'] = memoryFile('held.cidx.1.tmp', kept.bytes)
    // Fresh but free: a killed worker's, whose lock went with it.
    dir.children['free.cidx.2.tmp'] = memoryFile('free.cidx.2.tmp', kept.bytes, {lastModified: NOW})
    let release
    const holding = locks.request(`${TMP_LOCK_PREFIX}held.cidx.1.tmp`, () => new Promise((resolve) => {
      release = resolve
    }))
    expect(await sweepSidecars(getOpfsRoot, () => NOW, locks)).toBe(1)
    expect(Object.keys(dir.children).sort()).toEqual([await sidecarKey(`owner/${NAME}`), 'held.cidx.1.tmp'].sort())
    release()
    await holding
    expect(await sweepSidecars(getOpfsRoot, () => NOW, locks)).toBe(1)
    expect(Object.keys(dir.children)).toEqual([await sidecarKey(`owner/${NAME}`)])
  })

  it('a move that fails leaves no sidecar and no temporary, and says why', async () => {
    useFileHandle(Safari17WorkerFileHandle)
    const root = memoryDir({}, {writable: false})
    const getOpfsRoot = async () => root
    const PATH = 'owner/PSB.ifc'
    await writeSidecar(PATH, snapshot(), Uint8Array.of(7), getOpfsRoot)
    const dir = root.children[SIDECAR_DIR]
    const getFileHandle = dir.getFileHandle.bind(dir)
    dir.getFileHandle = async (name, options) => {
      const handle = await getFileHandle(name, options)
      handle.move = async () => {
        throw Object.assign(new Error('move refused'), {name: 'InvalidModificationError'})
      }
      return handle
    }
    expect(await writeSidecar(PATH, snapshot(), Uint8Array.of(1), getOpfsRoot))
      .toEqual({saved: false, writer: 'syncAccessHandle', error: 'InvalidModificationError: move refused'})
    // The old one was removed before the move, so the next open parses.
    expect(await readSidecar(PATH, snapshot(), getOpfsRoot)).toBeNull()
    expect(Object.keys(dir.children)).toEqual([])
  })

  it('a sync-handle write that comes up short keeps the previous sidecar, leaves no .tmp, and says why', async () => {
    useFileHandle(Safari17WorkerFileHandle)
    const root = memoryDir({}, {writable: false})
    const getOpfsRoot = async () => root
    const PATH = 'owner/PSB.ifc'
    await writeSidecar(PATH, snapshot(), Uint8Array.of(7), getOpfsRoot)
    const dir = root.children[SIDECAR_DIR]
    const getFileHandle = dir.getFileHandle.bind(dir)
    dir.getFileHandle = async (name, options) => {
      const handle = await getFileHandle(name, options)
      if (name.endsWith('.tmp')) {
        const open = handle.createSyncAccessHandle.bind(handle)
        handle.createSyncAccessHandle = async () => ({...await open(), write: () => 0})
      }
      return handle
    }
    const result = await writeSidecar(PATH, snapshot(), Uint8Array.of(1, 2), getOpfsRoot)
    expect(result).toMatchObject({saved: false, writer: 'syncAccessHandle'})
    expect(result.error).toMatch(/^Error: short write \(0 of \d+ bytes\)$/)
    expect(Array.from(await readSidecar(PATH, snapshot(), getOpfsRoot))).toEqual([7])
    expect(Object.keys(dir.children)).toEqual([await sidecarKey(PATH)])
  })

  it('writeThroughSyncHandle replaces the file only after the new bytes are flushed and closed', async () => {
    // No commit-on-close on a sync access handle: the real name must hold
    // the old bytes until the new ones are complete, then be swapped.
    const dir = memoryDir({'a.cidx': memoryFile('a.cidx', Uint8Array.of(1, 1, 1, 1))}, {writable: false})
    dir.children['a.cidx'].parent = dir
    const order = []
    const realFile = () => (dir.children['a.cidx'] ? Array.from(dir.children['a.cidx'].bytes).join('') : 'gone')
    const getFileHandle = dir.getFileHandle.bind(dir)
    dir.getFileHandle = async (name, options) => {
      const handle = await getFileHandle(name, options)
      const open = handle.createSyncAccessHandle.bind(handle)
      handle.createSyncAccessHandle = async () => {
        const access = await open()
        return {
          ...access,
          write: (from, at) => {
            order.push(`write (real file ${realFile()})`)
            return access.write(from, at)
          },
          flush: () => order.push('flush'),
          close: () => order.push(`close (real file ${realFile()})`),
        }
      }
      const move = handle.move.bind(handle)
      handle.move = async (to, newName) => {
        order.push(`move (real file ${realFile()})`)
        return move(to, newName)
      }
      return handle
    }
    await writeThroughSyncHandle(dir, 'a.cidx', Uint8Array.of(2, 2))
    expect(order).toEqual(['write (real file 1111)', 'flush', 'close (real file 1111)', 'move (real file gone)'])
    expect(Array.from(dir.children['a.cidx'].bytes)).toEqual([2, 2])
    expect(Object.keys(dir.children)).toEqual(['a.cidx'])
  })

  it('with neither writer (a page) nothing is saved or created, and the reason says so', async () => {
    useFileHandle(class {})
    const root = memoryDir({}, {writable: false})
    expect(await writeSidecar('owner/x.ifc', snapshot(), Uint8Array.of(1), async () => root))
      .toEqual({saved: false, writer: null, error: 'no createWritable or createSyncAccessHandle here'})
    expect(root.children).toEqual({})
  })

  it('a replaced entry\'s sidecar is not a candidate, and its save leaves one sidecar, not two', async () => {
    const root = memoryDir()
    const getOpfsRoot = async () => root
    const PATH = 'owner/repo/logo.step'
    await writeSidecar(PATH, snapshot(), Uint8Array.of(1), getOpfsRoot)
    const replaced = new File([BYTES], NAME, {lastModified: MTIME + 1})
    // The envelope describes the old version: no candidate for the new one.
    expect(await readSidecar(PATH, replaced, getOpfsRoot)).toBeNull()
    expect(await readSidecar(PATH, new File([BYTES.subarray(0, 8)], NAME, {lastModified: MTIME}), getOpfsRoot))
      .toBeNull()
    await writeSidecar(PATH, replaced, Uint8Array.of(2), getOpfsRoot)
    expect(Object.keys(root.children[SIDECAR_DIR].children)).toHaveLength(1)
    expect(Array.from(await readSidecar(PATH, replaced, getOpfsRoot))).toEqual([2])
  })

  it('the sweep removes the sidecars of entries that are gone, and keeps the rest', async () => {
    const root = memoryDir({owner: memoryDir({[NAME]: memoryFile(NAME, BYTES)})})
    const getOpfsRoot = async () => root
    await writeSidecar(`owner/${NAME}`, snapshot(), Uint8Array.of(1), getOpfsRoot)
    await writeSidecar('owner/deleted.step', snapshot(), Uint8Array.of(2), getOpfsRoot)
    await writeSidecar('gone/dir/x.ifc', snapshot(), Uint8Array.of(3), getOpfsRoot)
    root.children[SIDECAR_DIR].children['not-an-envelope.cidx'] = memoryFile('n', Uint8Array.of(0))
    // Sync-handle temporaries (Share#2093): envelopes for an entry that still
    // exists, so only their name and age retire them. A fresh one may be
    // another tab's, unlocked between its close and its move (codex review
    // of Share#2095): kept. A stale one was abandoned: removed.
    const NOW = MTIME + (2 * STALE_TMP_MS)
    const kept = root.children[SIDECAR_DIR].children[await sidecarKey(`owner/${NAME}`)]
    root.children[SIDECAR_DIR].children['stale.cidx.1.tmp'] = memoryFile('stale.cidx.1.tmp', kept.bytes)
    root.children[SIDECAR_DIR].children['fresh.cidx.2.tmp'] =
      memoryFile('fresh.cidx.2.tmp', kept.bytes, {lastModified: NOW - 1000})
    // No Web Locks (the file's beforeEach), so age decides.
    expect(await sweepSidecars(getOpfsRoot, () => NOW)).toBe(4)
    expect(Object.keys(root.children[SIDECAR_DIR].children))
      .toEqual([await sidecarKey(`owner/${NAME}`), 'fresh.cidx.2.tmp'])
    expect(Array.from(await readSidecar(`owner/${NAME}`, snapshot(), getOpfsRoot))).toEqual([1])
  })

  it('with the runtime\'s own Web Locks the sweep takes the lock path: a fresh, unlocked temporary goes', async () => {
    // The case CI's Node 24 hit through the global, made explicit: the sweep
    // reads `navigator.locks` when not handed a manager.
    const root = memoryDir({owner: memoryDir({[NAME]: memoryFile(NAME, BYTES)})})
    const getOpfsRoot = async () => root
    await writeSidecar(`owner/${NAME}`, snapshot(), Uint8Array.of(1), getOpfsRoot)
    const NOW = MTIME + (2 * STALE_TMP_MS)
    const kept = root.children[SIDECAR_DIR].children[await sidecarKey(`owner/${NAME}`)]
    root.children[SIDECAR_DIR].children['fresh.cidx.2.tmp'] =
      memoryFile('fresh.cidx.2.tmp', kept.bytes, {lastModified: NOW - 1000})
    useWebLocks(fakeLocks())
    expect(await sweepSidecars(getOpfsRoot, () => NOW)).toBe(1)
    expect(Object.keys(root.children[SIDECAR_DIR].children)).toEqual([await sidecarKey(`owner/${NAME}`)])
  })

  it('Clear cache leaves no sidecar behind', async () => {
    const root = memoryDir({owner: memoryDir({[NAME]: memoryFile(NAME, BYTES)})})
    await writeSidecar(`owner/${NAME}`, snapshot(), Uint8Array.of(1), async () => root)
    // OPFS.worker.js registers its message handler on `self` at import, as
    // OPFS.worker.test.js stubs it; this node environment has none.
    global.importScripts = jest.fn()
    global.self = {addEventListener: jest.fn(), postMessage: jest.fn()}
    const {deleteAllEntries} = require('../OPFS/OPFS.worker')
    expect(await deleteAllEntries(root)).toEqual([])
    expect(root.children).toEqual({})
  })

  it('the engine\'s entry search never descends into the sidecar directory', async () => {
    const root = memoryDir({owner: memoryDir({[NAME]: memoryFile(NAME, BYTES)})})
    await writeSidecar(`owner/${NAME}`, snapshot(), Uint8Array.of(1), async () => root)
    const dir = root.children[SIDECAR_DIR]
    const entries = dir.entries.bind(dir)
    let entered = 0
    dir.entries = () => {
      entered++
      return entries()
    }
    expect((await locateOpfsEntry(snapshot(), root)).path).toBe(`owner/${NAME}`)
    expect(entered).toBe(0)
  })

  it('indexLine says where the index came from and whether a sidecar was saved', () => {
    const MIB = 1024 * 1024
    expect(indexLine({source: 'sidecar', bytes: 16.5 * MIB, saved: false}))
      .toBe('Engine index: from sidecar (16.5 MB), no parse')
    expect(indexLine({source: 'parse', bytes: 2 * MIB, saved: true}))
      .toBe('Engine index: parsed; sidecar saved (2.0 MB)')
    expect(indexLine({source: 'sidecarRejected', bytes: 2 * MIB, saved: true}))
      .toBe('Engine index: sidecar refused, parsed; sidecar saved (2.0 MB)')
    expect(indexLine({source: 'parse', bytes: 0, saved: false}))
      .toBe('Engine index: parsed; no sidecar saved')
    // Share#2093: the fallback writer that saved it, or why nothing was saved.
    expect(indexLine({source: 'parse', bytes: 143.8 * MIB, saved: true, writer: 'syncAccessHandle'}))
      .toBe('Engine index: parsed; sidecar saved (143.8 MB, via sync access handle)')
    expect(indexLine({source: 'parse', bytes: 143.8 * MIB, saved: false, saveError: 'QuotaExceededError: full'}))
      .toBe('Engine index: parsed; no sidecar saved (QuotaExceededError: full)')
    expect(indexLine(undefined)).toBeUndefined()
  })
})


describe('engine/engineSources: both worker stores read synchronously (conway#757)', () => {
  it('the sync access handle store offers readSync over the same handle', () => {
    const access = {read: (into, {at}) => {
      into.set(BYTES.subarray(at, at + into.length))
      return into.length
    }, close: () => null}
    const store = makeSyncHandleStore(access, 64)
    expect(Array.from(store.readSync(10, 3))).toEqual([10, 11, 12])
    expect(store.counters).toMatchObject({reads: 1, bytes: 3})
  })

  it('the Blob store offers readSync where FileReaderSync exists (a worker), and not elsewhere', () => {
    expect(makeBlobStore(new Blob([BYTES]), undefined, undefined).readSync).toBeUndefined()
    // FileReaderSync reads a Blob synchronously; stand in with one over a
    // slice of BYTES, since jsdom/node has none.
    const blob = {size: 64, slice: (start, end) => ({start, end})}
    /** A FileReaderSync stand-in. */
    class FakeReaderSync {
      /**
       * @param {object} slice
       * @return {ArrayBuffer}
       */
      readAsArrayBuffer({start, end}) {
        return BYTES.slice(start, end).buffer
      }
    }
    const store = makeBlobStore(blob, () => 0, FakeReaderSync)
    expect(Array.from(store.readSync(4, 4))).toEqual([4, 5, 6, 7])
    expect(store.counters).toMatchObject({reads: 1, bytes: 4})
  })

  it('openSourceStore reports the entry\'s path, which keys its sidecar', async () => {
    const root = memoryDir({owner: memoryDir({repo: memoryDir({[NAME]: memoryFile(NAME, BYTES)})})})
    const opened = await openSourceStore({file: snapshot()}, {getOpfsRoot: async () => root, canSyncHandle: () => true})
    expect(opened).toMatchObject({fallbackReason: null, entryPath: `owner/repo/${NAME}`})
    expect(opened.store.kind).toBe('syncHandle')
    const offOpfs = await openSourceStore({file: snapshot()}, {getOpfsRoot: async () => memoryDir(),
      canSyncHandle: () => true})
    expect(offOpfs).toMatchObject({fallbackReason: 'not an OPFS file', entryPath: null})
  })
})


/**
 * A stub engine with the index sidecar calls: a parse reads the store and
 * exports `SIDECAR`; an index-first open accepts only a sidecar equal to it.
 *
 * @param {Array<string>} log what was called
 * @param {object} [options]
 * @param {boolean} [options.refuseIndex] OpenModelFromIndex returns -1
 * @return {object}
 */
function sidecarApi(log, {refuseIndex = false} = {}) {
  const SIDECAR = Uint8Array.of(0x43, 0x49, 0x44, 0x58, 3)
  return {
    SIDECAR,
    wasmModule: undefined,
    async Init() {
      this.wasmModule = {HEAPU8: {byteLength: 1}}
    },
    async OpenModelStream(store, settings) {
      log.push(`stream recordHash=${settings.RECORD_SOURCE_HASH === true} readSync=${typeof store.readSync}`)
      await store.read(0, 4)
      return 0
    },
    async OpenModelFromIndex(store, sidecar, settings) {
      log.push(`index verify=${settings.VERIFY_INDEX_SOURCE_HASH}`)
      return refuseIndex || sidecar.length !== SIDECAR.length ? -1 : 0
    },
    async ExportIndexSidecar() {
      log.push('export')
      return SIDECAR
    },
    async ExtractGeometryBatchAsync() {
      return {extracted: 0, remaining: 0}
    },
    StreamAllMeshesAsync: async () => null,
    StreamAllMeshes: () => null,
    getStatistics: () => null,
    CloseModel: () => log.push('CloseModel'),
    IsModelOpen: () => true,
    properties: {},
  }
}


/**
 * One streamed open in a worker-transport session over `root`, to its
 * `done` packet.
 *
 * @param {object} api
 * @param {object} root
 * @param {object} [flags]
 * @return {Promise<object>} the `done` summary
 */
async function loadOnce(api, root, flags = {}) {
  const listeners = []
  const toPage = (data) => queueMicrotask(() => listeners.forEach((cb) => cb({data})))
  const handler = createEngineHandler({
    loadIfcAPI: async () => function IfcAPI() {
      return api
    },
    post: toPage,
    yieldToLoop: () => Promise.resolve(),
    sourceOptions: {getOpfsRoot: async () => root, canSyncHandle: () => true},
  })
  const fakeWorker = {
    addEventListener: (type, cb) => type === 'message' && listeners.push(cb),
    postMessage: (msg) => queueMicrotask(() => handler.handle(msg)),
    terminate: () => null,
  }
  const session = new EngineSession(makeWorkerTransport(fakeWorker), {epoch: 1})
  toPage({v: ENGINE_PROTOCOL_VERSION, epoch: 0, ev: Ev.HELLO, seq: 0})
  await session.init({flags})
  const done = new Promise((resolve) => session.on(Ev.DONE, (msg) => resolve(msg.summary)))
  await session.open({file: snapshot()}, {format: 'step', stream: {previews: false}})
  const summary = await done
  await session.close()
  return summary
}


describe('engine/engineHandler: index sidecar reopen (engine-worker.md §7 step 8)', () => {
  it('the first open parses and saves a sidecar; the reopen opens from it, with the full source check', async () => {
    const log = []
    const api = sidecarApi(log)
    const root = memoryDir({owner: memoryDir({[NAME]: memoryFile(NAME, BYTES)})})

    const first = await loadOnce(api, root)
    expect(first.index).toEqual({source: 'parse', bytes: api.SIDECAR.length, saved: true})
    // The parse recorded the digests the export needs, and read through a
    // store a windowed STEP can fault into.
    expect(log).toEqual(['stream recordHash=true readSync=function', 'export', 'CloseModel'])

    log.length = 0
    const second = await loadOnce(api, root)
    expect(second.index).toEqual({source: 'sidecar', bytes: api.SIDECAR.length, saved: false})
    // No parse, and no second export. `verify=true` is the full source
    // hash the owner chose on Share#2085; 'sampled' here is a regression.
    expect(log).toEqual(['index verify=true', 'CloseModel'])
  })

  it('a refused sidecar falls back to the parse and is replaced', async () => {
    const log = []
    const root = memoryDir({owner: memoryDir({[NAME]: memoryFile(NAME, BYTES)})})
    await loadOnce(sidecarApi([]), root)
    const reopened = await loadOnce(sidecarApi(log, {refuseIndex: true}), root)
    expect(reopened.index).toEqual({source: 'sidecarRejected', bytes: 5, saved: true})
    expect(log).toEqual([
      'index verify=true', 'stream recordHash=true readSync=function', 'export', 'CloseModel',
    ])
  })

  it('the kill switch neither reads nor writes one, and the parse records no hash', async () => {
    const log = []
    const root = memoryDir({owner: memoryDir({[NAME]: memoryFile(NAME, BYTES)})})
    const summary = await loadOnce(sidecarApi(log), root, {disableEngineSidecar: true})
    expect(summary.index).toBeUndefined()
    expect(log).toEqual(['stream recordHash=false readSync=function', 'CloseModel'])
    expect(root.children[SIDECAR_DIR]).toBeUndefined()
  })

  it('under the sync-handle kill switch the Blob store reopens from the sidecar too', async () => {
    // The worker's Blob store (FileReaderSync) serves the index path as well
    // as the sync handle does, so the entry must be found, and its sidecar
    // used, whichever store reads it (codex review of Share#2085). Node has
    // no FileReaderSync, so these opens read with `readSync` undefined.
    const log = []
    const api = sidecarApi(log)
    const root = memoryDir({owner: memoryDir({[NAME]: memoryFile(NAME, BYTES)})})
    const first = await loadOnce(api, root, {disableEngineSyncHandle: true})
    expect(first.index).toEqual({source: 'parse', bytes: api.SIDECAR.length, saved: true})
    expect(first.source).toMatchObject({kind: 'blob', fallbackReason: 'disabled'})
    const second = await loadOnce(api, root, {disableEngineSyncHandle: true})
    expect(second.index).toEqual({source: 'sidecar', bytes: api.SIDECAR.length, saved: false})
  })

  it('without createWritable (Safari before 26) the first load saves through a sync access handle and the next opens from it', async () => {
    // Share#2093's "done when", at the handler: a Blob-store load (Safari has
    // no read-only handles either) saves a sidecar, and the reopen skips the
    // parse.
    useFileHandle(Safari17WorkerFileHandle)
    const log = []
    const api = sidecarApi(log)
    const root = memoryDir({owner: memoryDir({[NAME]: memoryFile(NAME, BYTES)})}, {writable: false})
    const first = await loadOnce(api, root, {disableEngineSyncHandle: true})
    expect(first.index).toEqual({source: 'parse', bytes: api.SIDECAR.length, saved: true, writer: 'syncAccessHandle'})
    const second = await loadOnce(api, root, {disableEngineSyncHandle: true})
    expect(second.index).toEqual({source: 'sidecar', bytes: api.SIDECAR.length, saved: false})
  })

  it('an open from the sidecar still sweeps, so a model that always reopens retires strays', async () => {
    const api = sidecarApi([])
    const root = memoryDir({owner: memoryDir({[NAME]: memoryFile(NAME, BYTES)})})
    await loadOnce(api, root)
    // An interrupted Safari write's temporary, long abandoned (no
    // navigator.locks here, the file's beforeEach, so the age fallback
    // decides).
    root.children[SIDECAR_DIR].children['x.cidx.1.tmp'] = memoryFile('x.cidx.1.tmp', Uint8Array.of(0))
    expect((await loadOnce(api, root)).index.source).toBe('sidecar')
    expect(Object.keys(root.children[SIDECAR_DIR].children)).toEqual([await sidecarKey(`owner/${NAME}`)])
  })

  it('a save that fails carries its reason in the done packet', async () => {
    const api = sidecarApi([])
    const root = memoryDir({owner: memoryDir({[NAME]: memoryFile(NAME, BYTES)})})
    const getDirectoryHandle = root.getDirectoryHandle.bind(root)
    root.getDirectoryHandle = async (name, options) => {
      if (name === SIDECAR_DIR && options?.create) {
        throw Object.assign(new Error('storage full'), {name: 'QuotaExceededError'})
      }
      return getDirectoryHandle(name, options)
    }
    expect((await loadOnce(api, root)).index).toEqual({
      source: 'parse', bytes: api.SIDECAR.length, saved: false, saveError: 'QuotaExceededError: storage full',
    })
    api.ExportIndexSidecar = async () => {
      throw new RangeError('out of memory')
    }
    expect((await loadOnce(api, root)).index)
      .toMatchObject({saved: false, saveError: 'export failed: RangeError: out of memory'})
  })

  it('a source with no OPFS entry gets no sidecar', async () => {
    const log = []
    const summary = await loadOnce(sidecarApi(log), memoryDir())
    expect(summary.index).toBeUndefined()
    expect(log[0]).toBe('stream recordHash=false readSync=undefined')
  })
})


describe('engine/engineHandler: a STEP whose session fell back in process (#1776, conway#757)', () => {
  it('a refused store open buffers inside the session\'s own engine, with nothing windowed or leaked', async () => {
    // In process there is no createSyncAccessHandle and no FileReaderSync,
    // so the store cannot read synchronously and conway refuses a STEP's
    // store open (STORE_NOT_SYNCHRONOUS, -1). The buffered retry must run
    // on THIS session's IfcAPI — the burned handle is the session's — and
    // the model it opens is the one the session reports.
    const calls = []
    const api = {
      wasmModule: undefined,
      async Init() {
        this.wasmModule = {HEAPU8: {byteLength: 1}}
      },
      async OpenModelStream(store) {
        calls.push(`stream readSync=${typeof store.readSync}`)
        return typeof store.readSync === 'function' ? 0 : -1
      },
      async OpenModelStreamed(bytes) {
        calls.push(`streamed ${bytes.byteLength}`)
        return 1
      },
      getStatistics: () => ({getLoadStatus: () => 'STORE_NOT_SYNCHRONOUS', getLoadFailureReason: () => ''}),
      CloseModel: (id) => calls.push(`close ${id}`),
      IsModelOpen: () => true,
      properties: {},
    }
    const listeners = []
    const toPage = (data) => queueMicrotask(() => listeners.forEach((cb) => cb({data})))
    const handler = createEngineHandler({
      loadIfcAPI: async () => function IfcAPI() {
        return api
      },
      post: toPage,
      yieldToLoop: () => Promise.resolve(),
      // The page: no sync access handles, and (node) no FileReaderSync.
      sourceOptions: {canSyncHandle: () => false},
    })
    const fakeWorker = {
      addEventListener: (type, cb) => type === 'message' && listeners.push(cb),
      postMessage: (msg) => queueMicrotask(() => handler.handle(msg)),
      terminate: () => null,
    }
    const session = new EngineSession(makeWorkerTransport(fakeWorker), {epoch: 1})
    toPage({v: ENGINE_PROTOCOL_VERSION, epoch: 0, ev: Ev.HELLO, seq: 0})
    await session.init({flags: {}})
    const opened = await session.open({file: snapshot()}, {format: 'step'})
    expect(calls).toEqual(['stream readSync=undefined', `streamed ${BYTES.length}`])
    expect(opened).toMatchObject({modelID: 1, windowed: false, source: {kind: 'resident'}})
    await session.close()
  })
})
