import {
  ASSIST_LOG_VERSION,
  LOG_MAX_AGE_MS,
  LOG_MAX_CHARS,
  openAssistLog,
  sweepAssistLogs,
} from './assistLog'
import {assistSessionKey, assistStorageKeys} from './assistSessionKey'


/* eslint-disable no-magic-numbers */
const KEY = assistSessionKey({modelRoute: 'https://bldrs.ai/index.ifc', scope: 'anonymous'})
const NOW = Date.parse('2026-11-20T12:00:00.000Z')


/**
 * A localStorage over a Map, whose methods can be made to throw.
 *
 * @return {object}
 */
function fakeStorage() {
  const data = new Map()
  const fail = {get: false, set: false}
  return {
    data,
    fail,
    get length() {
      return data.size
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => {
      if (fail.get) {
        throw new Error('SecurityError')
      }
      return data.has(k) ? data.get(k) : null
    },
    setItem: (k, v) => {
      if (fail.set) {
        throw new Error('QuotaExceededError')
      }
      data.set(k, String(v))
    },
    removeItem: (k) => {
      data.delete(k)
    },
  }
}


/**
 * @param {object} storage
 * @param {object} [deps]
 * @return {object} a log over the fake, with an in-process Web Locks stand-in unless given
 */
function logOn(storage, deps = {}) {
  return openAssistLog(KEY, {storage, locks: fakeLocks(), now: () => NOW, ...deps})
}


/**
 * Web Locks as one realm sees them: requests for one name run one at a time.
 *
 * @return {object} a `navigator.locks` stand-in
 */
function fakeLocks() {
  const tails = new Map()
  return {
    request: jest.fn((name, cb) => {
      const run = (tails.get(name) ?? Promise.resolve()).then(() => cb())
      tails.set(name, run.catch(() => undefined))
      return run
    }),
  }
}


describe('Bot/assistLog', () => {
  it('appends in order, with a sequence that only grows, and survives a reopen', () => {
    const storage = fakeStorage()
    const log = logOn(storage)
    log.begin('c1')
    const t1 = log.appendTurn({text: 'how many doors'})
    log.appendMessages(t1, [{role: 'user', content: 'how many doors'}])
    log.appendShown(t1, [{id: 'm1', kind: 'user', text: 'how many doors'}])
    const t2 = log.appendTurn({text: 'and windows'})
    expect([t1, t2]).toEqual([1, 4])
    const record = logOn(storage).load()
    expect(record).toMatchObject({v: ASSIST_LOG_VERSION, key: KEY, conversationId: 'c1', nextSeq: 5})
    expect(record.entries.map((e) => [e.seq, e.kind])).toEqual([[1, 'turn'], [2, 'messages'], [3, 'shown'], [4, 'turn']])
    expect(logOn(storage).queuedTurn()).toMatchObject({seq: 4, text: 'and windows', state: 'queued'})
  })

  it('ensure keeps the same conversation and starts afresh for another', () => {
    const log = logOn(fakeStorage())
    log.ensure('c1')
    log.appendTurn({text: 'a'})
    log.ensure('c1')
    expect(log.load().entries).toHaveLength(1)
    log.ensure('c2')
    expect(log.load()).toMatchObject({conversationId: 'c2', entries: []})
  })

  describe('the ratchet', () => {
    it('claims a queued turn once; a second claim, a stale timer or a reopened log is a no-op', async () => {
      const storage = fakeStorage()
      const log = logOn(storage)
      log.begin('c1')
      const seq = log.appendTurn({text: 'a'})
      expect(await log.claim(seq)).toBe(true)
      expect(log.turn(seq).state).toBe('sent')
      expect(await log.claim(seq)).toBe(false)
      // A reload: a new log over the same storage.
      expect(await logOn(storage).claim(seq)).toBe(false)
      expect(await log.claim(999)).toBe(false)
    })

    it('three logs on one storage (tabs, a reload) claim one turn: the ratchet lets exactly one win', async () => {
      const storage = fakeStorage()
      logOn(storage).begin('c1')
      const seq = logOn(storage).appendTurn({text: 'a'})
      const tabs = [logOn(storage), logOn(storage), logOn(storage)]
      const wins = await Promise.all(tabs.map((tab) => tab.claim(seq)))
      expect(wins.filter(Boolean)).toHaveLength(1)
    })

    it('states only move forward', () => {
      const log = logOn(fakeStorage())
      log.begin('c1')
      const seq = log.appendTurn({text: 'a'})
      expect(log.settle(seq, 'answered')).toBe(true)
      expect(log.settle(seq, 'sent')).toBe(false)
      expect(log.settle(seq, 'queued')).toBe(false)
      expect(log.cancel(seq)).toBe(false)
      expect(log.turn(seq).state).toBe('answered')
    })

    it('waits for notBefore, unless told not to', async () => {
      let now = NOW
      const log = openAssistLog(KEY, {storage: fakeStorage(), locks: fakeLocks(), now: () => now})
      log.begin('c1')
      const seq = log.appendTurn({text: 'a', notBefore: NOW + 1000})
      expect(await log.claim(seq)).toBe(false)
      now = NOW + 1000
      expect(await log.claim(seq)).toBe(true)
      const other = log.appendTurn({text: 'b', notBefore: NOW + 60000})
      expect(await log.claim(other, {ignoreNotBefore: true})).toBe(true)
    })

    it('a refused turn is requeued as a new entry; the old one can never be sent again', async () => {
      const log = logOn(fakeStorage())
      log.begin('c1')
      const seq = log.appendTurn({text: 'a'})
      await log.claim(seq)
      const next = log.requeue(seq, {notBefore: NOW - 1, tier: 'anonymous'})
      expect(next).toBeGreaterThan(seq)
      expect(log.turn(seq).state).toBe('refused')
      expect(log.turn(next)).toMatchObject({text: 'a', state: 'queued', notBefore: NOW - 1, tier: 'anonymous',
        requeueOf: seq})
      expect(await log.claim(seq)).toBe(false)
      expect(await log.claim(next)).toBe(true)
      // Requeueing twice is a no-op the second time.
      expect(log.requeue(seq, {notBefore: NOW})).toBeNull()
    })

    it('cancel drops the text from the log', () => {
      const log = logOn(fakeStorage())
      log.begin('c1')
      const seq = log.appendTurn({text: 'private question'})
      expect(log.cancel(seq)).toBe(true)
      expect(log.turn(seq).state).toBe('cancelled')
      expect(JSON.stringify(log.load())).not.toContain('private question')
      expect(log.queuedTurn()).toBeNull()
    })
  })

  describe('the lock', () => {
    it('uses Web Locks when there are some, by the derived lock name', async () => {
      const names = []
      const locks = {request: jest.fn((name, cb) => {
        names.push(name)
        return Promise.resolve(cb())
      })}
      const storage = fakeStorage()
      const log = logOn(storage, {locks})
      log.begin('c1')
      expect(await log.claim(log.appendTurn({text: 'a'}))).toBe(true)
      expect(names).toEqual([assistStorageKeys(KEY).lock])
      // Nothing but the log in storage.
      expect([...storage.data.keys()]).toEqual([KEY])
    })

    // Codex on #2253: a write-then-read-back lease over localStorage lets two
    // tabs both win, so without Web Locks nothing claims on its own.
    it('without them, an automatic claim never runs; the user\'s own (manual) claim does, once', async () => {
      const storage = fakeStorage()
      const log = logOn(storage, {locks: null})
      log.begin('c1')
      const seq = log.appendTurn({text: 'a'})
      expect(log.canAutoForward()).toBe(false)
      expect(await log.claim(seq)).toBe(false)
      expect(log.turn(seq).state).toBe('queued')
      expect(await log.claim(seq, {manual: true})).toBe(true)
      // A press in another tab after it was sent: the ratchet makes it a no-op.
      expect(await logOn(storage, {locks: null}).claim(seq, {manual: true})).toBe(false)
      expect(storage.data.size).toBe(1)
    })

    it('a lock manager that refuses counts as none from then on', async () => {
      const locks = {request: jest.fn(() => Promise.reject(new Error('SecurityError')))}
      const log = logOn(fakeStorage(), {locks})
      log.begin('c1')
      const seq = log.appendTurn({text: 'a'})
      expect(log.canAutoForward()).toBe(true)
      expect(await log.claim(seq)).toBe(false)
      expect(log.canAutoForward()).toBe(false)
      expect(await log.claim(seq, {manual: true})).toBe(true)
    })

    it('a memory-only log, which no other tab sees, forwards on its own', async () => {
      const log = openAssistLog(null, {locks: null})
      log.begin('c1')
      expect(log.canAutoForward()).toBe(true)
      expect(await log.claim(log.appendTurn({text: 'a'}))).toBe(true)
    })
  })

  describe('storage', () => {
    it('ignores and removes an unreadable record, another version, or another key\'s', () => {
      const storage = fakeStorage()
      for (const raw of ['{not json', JSON.stringify({v: 99, key: KEY}),
        JSON.stringify({v: 1, key: 'other', conversationId: 'c', nextSeq: 1, entries: [], updatedAt: NOW})]) {
        storage.setItem(KEY, raw)
        expect(logOn(storage).load()).toBeNull()
        expect(storage.data.has(KEY)).toBe(false)
      }
    })

    it('expires 48 h after its last write, or after its latest pause', () => {
      const storage = fakeStorage()
      openAssistLog(KEY, {storage, locks: null, now: () => NOW}).begin('c1')
      const at = (ms) => openAssistLog(KEY, {storage, locks: null, now: () => ms})
      expect(at(NOW + LOG_MAX_AGE_MS - 1).load()).not.toBeNull()
      const log = at(NOW)
      log.appendTurn({text: 'a', notBefore: NOW + (10 * 24 * 3600000)})
      // A pause ten days out (a 30-day window) keeps it past 48 h.
      expect(at(NOW + LOG_MAX_AGE_MS + 1).load()).not.toBeNull()
      expect(at(NOW + (12 * 24 * 3600000) + 1).load()).toBeNull()
      expect(storage.data.has(KEY)).toBe(false)
    })

    it('falls back to memory when storage throws, without throwing', async () => {
      const storage = fakeStorage()
      storage.fail.get = true
      storage.fail.set = true
      const log = logOn(storage)
      expect(() => log.begin('c1')).not.toThrow()
      const seq = log.appendTurn({text: 'a'})
      expect(log.isPersistent()).toBe(false)
      expect(await log.claim(seq)).toBe(true)
      expect(await log.claim(seq)).toBe(false)
    })

    it('a write that fails after a claim leaves no stale queued copy for a reload to send', async () => {
      const storage = fakeStorage()
      const log = logOn(storage)
      log.begin('c1')
      const seq = log.appendTurn({text: 'a'})
      storage.fail.set = true
      expect(await log.claim(seq)).toBe(true)
      storage.fail.set = false
      expect(await logOn(storage).claim(seq)).toBe(false)
      expect(storage.data.has(KEY)).toBe(false)
    })

    it('past its size cap drops the oldest transcript first, never a queued turn', () => {
      const storage = fakeStorage()
      const log = logOn(storage)
      log.begin('c1')
      const big = 'x'.repeat(LOG_MAX_CHARS / 4)
      for (let i = 0; i < 6; i++) {
        const t = log.appendTurn({text: `q${i}`})
        log.settle(t, 'answered')
        log.appendMessages(t, [{role: 'assistant', content: big}])
      }
      const waiting = log.appendTurn({text: 'the queued one', notBefore: NOW + 1000})
      const record = logOn(storage).load()
      expect(storage.getItem(KEY).length).toBeLessThanOrEqual(LOG_MAX_CHARS)
      expect(record.truncated).toBe(true)
      expect(record.entries.find((e) => e.seq === waiting)).toMatchObject({state: 'queued', text: 'the queued one'})
      // The newest transcript survives; the oldest went.
      expect(record.entries[0].seq).toBeGreaterThan(1)
    })

    it('a sweep removes expired logs and keeps live ones', () => {
      const storage = fakeStorage()
      const old = assistSessionKey({modelRoute: 'https://bldrs.ai/old.ifc', scope: 'anonymous'})
      openAssistLog(old, {storage, locks: null, now: () => NOW - LOG_MAX_AGE_MS - 1}).begin('c0')
      logOn(storage).begin('c1')
      storage.setItem('unrelated', 'kept')
      expect(sweepAssistLogs({storage, now: () => NOW})).toBe(1)
      expect([...storage.data.keys()].sort()).toEqual([KEY, 'unrelated'].sort())
      storage.fail.get = true
      expect(() => sweepAssistLogs({storage, now: () => NOW})).not.toThrow()
    })
  })
})
