import {assistStorageKeys, isAssistLogKey} from './assistSessionKey'


/**
 * The assistant's local session log: an append-only record of one
 * conversation, kept in localStorage so a reload (or a second tab) finds it,
 * and the store-and-forward queue that sends its turns.
 *
 * It is an early, local form of the session document of
 * design/new/workspace-sessions.md §4: the `entries` below are that doc's
 * `conversation.jsonl` (the AI SDK's messages, whole, as ai-workspace.md D10
 * keeps them) plus the turns that produce them. When sessions are built,
 * this moves under `sessions/<id>/` and its key (assistSessionKey.js) gains
 * the session id.
 *
 * ## Shape (v1)
 *
 *   {v: 1, key, conversationId, nextSeq, updatedAt, truncated?,
 *    entries: [
 *      {seq, kind: 'turn', text, state, notBefore, tier, at, stateAt},
 *      {seq, kind: 'messages', turn, messages: ModelMessage[]},
 *      {seq, kind: 'shown', turn, bubbles: [...]},
 *    ]}
 *
 * - A **turn** is what the user asked, waiting to be sent or sent. Its
 *   `state` only moves forward ((STATE_RANK)): `queued` → `sent` →
 *   `answered` | `refused` | `interrupted`; a queued turn can be
 *   `cancelled`. A pause is a queued turn with `notBefore` (the relay's
 *   `resumeAt`). `interrupted` is a turn stopped by switching to another
 *   model (assistForward.js): shown as asked and stopped, never sent again,
 *   since it may have run tools.
 * - **messages** are what the agent loop kept for a turn (its conversation
 *   store's append), so a reload sends them as the history.
 * - **shown** is the panel's record of a turn (its bubbles and task chip),
 *   so a reload shows the chat as it was. Never sent to a model.
 *
 * ## The ratchet: each turn is sent at most once
 *
 * `seq` is per log and only grows. A turn is forwarded only by {@link
 * AssistLog.claim}, which moves it from `queued` to `sent` in storage
 * before anything is sent, and does nothing when it finds the turn past
 * `queued`. So an old timer, a second tab, or a resend after a reload that
 * reaches a turn already claimed is a no-op. A refused turn is never sent
 * again under its own seq: {@link AssistLog.requeue} marks it `refused`
 * and appends its text as a NEW queued turn with the new `notBefore`. A turn
 * found `sent` with no answer after a reload (the tab closed mid-reply) is
 * left as it is: it may have reached the model, and sending it again could
 * run its tools twice. The user sees their message with no reply.
 *
 * ## The lock: one tab forwards
 *
 * localStorage is not transactional across tabs, so an automatic claim (a
 * timer's, a restore's) runs under the Web Locks API (`navigator.locks`,
 * lock name from assistStorageKeys), held only for the claim itself, never
 * for the reply. Every current browser has it (Chrome 69, Firefox 96,
 * Safari 15.4). Without it there is no exclusive lock to be had over
 * localStorage (a write-then-read-back lease lets two tabs both think they
 * won, Codex on #2253), so nothing is forwarded automatically there at
 * all (`canAutoForward()` is false when the log is in storage): the
 * panel offers Resume, and only the tab where the user presses it claims
 * the turn (`manual`), still through the ratchet, so a second press in
 * another tab after it was sent does nothing. A user's own action in one
 * tab (a send, Resume, signing in) claims the same way.
 *
 * ## Storage failing
 *
 * Every read and write is guarded. With no storage (private mode, blocked,
 * full), the log lives in this tab's memory: the panel works and pauses as
 * before, and a reload forgets it. A write that fails after a claim also
 * removes the stored copy, so a reload can never find a stale `queued` for
 * a turn this tab sent.
 *
 * ## What it holds, and how long
 *
 * The user's messages, the model's replies, and tool calls and results,
 * which carry model data (element names, properties) from the user's model.
 * It stays on the device, is never sent to analytics or Sentry, and nothing
 * logs its contents. It is cleared on New chat, when the session key
 * changes on a sign-in change, when a queued turn is cancelled (that turn),
 * and LOG_MAX_AGE_MS after its last write or its last pause ends.
 */


export const ASSIST_LOG_VERSION = 1

/** A log is dropped this long after its last write, or after its latest queued turn's `notBefore`. */
export const LOG_MAX_AGE_MS = 48 * 60 * 60 * 1000 // eslint-disable-line no-magic-numbers

/**
 * The most a log may take in storage, in UTF-16 characters (about 2 MB of
 * the ~5 MB a browser gives an origin). Past it the oldest transcript
 * entries go first; a queued turn is never dropped, so the cap can cost a
 * reload its history, never a waiting message.
 */
export const LOG_MAX_CHARS = 1000000

/** Turn states, in the only order they may move. */
export const STATE_RANK = Object.freeze({queued: 0, sent: 1, answered: 2, refused: 2, interrupted: 2, cancelled: 2})


/**
 * @return {?Storage} localStorage, or null when the page may not use it
 */
function defaultStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}


/**
 * @return {?object} the Web Locks manager, or null
 */
function defaultLocks() {
  try {
    const locks = globalThis.navigator?.locks
    return locks && typeof locks.request === 'function' ? locks : null
  } catch {
    return null
  }
}


/**
 * @param {object} record
 * @return {number} when the record expires: its last write, or its latest pause, plus the max age
 */
export function expiresAt(record) {
  let last = Number.isFinite(record.updatedAt) ? record.updatedAt : 0
  for (const entry of record.entries) {
    if (entry.kind === 'turn' && entry.state === 'queued' && Number.isFinite(entry.notBefore)) {
      last = Math.max(last, entry.notBefore)
    }
  }
  return last + LOG_MAX_AGE_MS
}


/**
 * @param {*} raw what storage held
 * @param {string} key the key it was read under
 * @param {number} nowMs
 * @return {?object} a well-formed, unexpired record of this key, or null
 */
function parseRecord(raw, key, nowMs) {
  if (typeof raw !== 'string') {
    return null
  }
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || data.v !== ASSIST_LOG_VERSION || data.key !== key || typeof data.conversationId !== 'string' ||
      !Number.isInteger(data.nextSeq) || !Array.isArray(data.entries) ||
      !data.entries.every((e) => e && Number.isInteger(e.seq) && typeof e.kind === 'string')) {
    return null
  }
  return expiresAt(data) <= nowMs ? null : data
}


/**
 * Drop the oldest transcript entries until the record fits {@link LOG_MAX_CHARS}.
 * Queued turns stay. Mutates `record`.
 *
 * @param {object} record
 * @return {string} the record as stored
 */
function fit(record) {
  let text = JSON.stringify(record)
  while (text.length > LOG_MAX_CHARS) {
    const index = record.entries.findIndex((e) => !(e.kind === 'turn' && e.state === 'queued'))
    if (index < 0) {
      break
    }
    record.entries.splice(index, 1)
    record.truncated = true
    text = JSON.stringify(record)
  }
  return text
}


/**
 * @typedef {object} AssistLog
 * @property {?string} key the session key, null for a memory-only log
 * @property {Function} load `() => ?record`, a copy
 * @property {Function} begin `(conversationId) => void`: a fresh, empty log
 * @property {Function} ensure `(conversationId) => void`: begin unless the log already holds that conversation
 * @property {Function} appendTurn `({text, notBefore?, tier?}) => seq`
 * @property {Function} appendMessages `(turn, messages) => void`
 * @property {Function} appendShown `(turn, bubbles) => void`
 * @property {Function} claim `(seq, {ignoreNotBefore?, manual?}) => Promise<boolean>`: queued → sent, once.
 *   `manual`: the user asked for it in this tab, so it may claim without Web Locks
 * @property {Function} canAutoForward `() => boolean`: whether a claim may run with no user action
 * @property {Function} settle `(seq, state) => boolean`: move a turn forward; false when it couldn't
 * @property {Function} requeue `(seq, {notBefore, tier}) => ?seq`: refused, and its text queued anew
 * @property {Function} cancel `(seq) => boolean`
 * @property {Function} turn `(seq) => ?entry`
 * @property {Function} queuedTurn `() => ?entry`: the latest queued turn
 * @property {Function} clear `() => void`
 * @property {Function} isPersistent `() => boolean`: whether storage is in use
 */


/**
 * @param {?string} sessionKey from assistSessionKey; null for a log that is
 *   memory-only (no model to key it by)
 * @param {object} [deps] for tests
 * @param {?Storage} [deps.storage]
 * @param {?object} [deps.locks] a Web Locks manager, or null for none (manual claims only)
 * @param {Function} [deps.now]
 * @return {AssistLog}
 */
export function openAssistLog(sessionKey, {
  storage = defaultStorage(), locks = defaultLocks(), now = Date.now,
} = {}) {
  const keys = sessionKey ? assistStorageKeys(sessionKey) : null
  let store = keys ? storage : null
  // The record as this tab last wrote it: the log with no storage, and the
  // fallback when storage stops answering.
  let memory = null

  const read = () => {
    if (store) {
      try {
        const raw = store.getItem(keys.log)
        const record = parseRecord(raw, sessionKey, now())
        if (!record && raw !== null) {
          // Unreadable, another version, another key, or expired: dropped.
          store.removeItem(keys.log)
        }
        memory = record
        return record ? structuredCloneJson(record) : null
      } catch {
        store = null
      }
    }
    return memory ? structuredCloneJson(memory) : null
  }

  /**
   * @param {object} record
   * @return {boolean} whether it was kept (in storage when there is one)
   */
  const write = (record) => {
    record.updatedAt = now()
    const text = fit(record)
    memory = JSON.parse(text)
    if (!store) {
      return true
    }
    try {
      store.setItem(keys.log, text)
      return true
    } catch {
      // Full or blocked: carry on in memory, and leave no stale copy that a
      // reload could forward again.
      try {
        store.removeItem(keys.log)
      } catch {
        // ignore
      }
      store = null
      return false
    }
  }

  const fresh = (conversationId) => ({v: ASSIST_LOG_VERSION, key: sessionKey ?? '', conversationId, nextSeq: 1,
    updatedAt: now(), entries: []})

  const mutate = (change) => {
    const record = read()
    if (!record) {
      return undefined
    }
    const result = change(record)
    if (result !== undefined && result !== false) {
      write(record)
    }
    return result
  }

  const append = (entry) => mutate((record) => {
    const seq = record.nextSeq
    record.nextSeq = seq + 1
    record.entries.push({seq, ...entry})
    return seq
  })

  const findTurn = (record, seq) => record.entries.find((e) => e.kind === 'turn' && e.seq === seq)

  const settleIn = (record, seq, state) => {
    const entry = findTurn(record, seq)
    if (!entry || !(STATE_RANK[state] > STATE_RANK[entry.state])) {
      return false
    }
    entry.state = state
    entry.stateAt = now()
    return true
  }

  /**
   * @param {Function} fn the claim, synchronous
   * @param {boolean} manual whether the user asked for it in this tab
   * @return {Promise<*>} its result, or false when it may not run here
   */
  const withLock = async (fn, manual) => {
    if (!store) {
      // Memory only: no other tab can see this log.
      return fn()
    }
    if (locks) {
      try {
        return await locks.request(keys.lock, () => fn())
      } catch {
        // A lock manager that refuses (an opaque origin): as if there were
        // none, from now on (canAutoForward turns false).
        locks = null
      }
    }
    // No exclusive lock across tabs: only the user's own action claims,
    // through the ratchet alone (the header's "The lock").
    return manual ? fn() : false
  }

  return {
    key: sessionKey,
    load: read,
    begin: (conversationId) => {
      write(fresh(conversationId))
    },
    ensure: (conversationId) => {
      if (read()?.conversationId !== conversationId) {
        write(fresh(conversationId))
      }
    },
    appendTurn: ({text, notBefore = null, tier = null}) =>
      append({kind: 'turn', text, state: 'queued', notBefore, tier, at: now(), stateAt: now()}) ?? null,
    appendMessages: (turn, messages) => {
      append({kind: 'messages', turn, messages})
    },
    appendShown: (turn, bubbles) => {
      append({kind: 'shown', turn, bubbles})
    },
    canAutoForward: () => store === null || locks !== null,
    claim: (seq, {ignoreNotBefore = false, manual = false} = {}) => withLock(() => {
      const record = read()
      const entry = record && findTurn(record, seq)
      if (!entry || entry.state !== 'queued' ||
          (!ignoreNotBefore && Number.isFinite(entry.notBefore) && entry.notBefore > now())) {
        return false
      }
      settleIn(record, seq, 'sent')
      // Kept (in storage, or in memory with none): the claim holds. A write
      // that failed has removed the stored copy, so no other tab or reload
      // can find this turn queued either.
      write(record)
      return true
    }, manual),
    settle: (seq, state) => Boolean(mutate((record) => settleIn(record, seq, state))),
    requeue: (seq, {notBefore, tier = null}) => mutate((record) => {
      const entry = findTurn(record, seq)
      if (!entry || !settleIn(record, seq, 'refused')) {
        return false
      }
      const next = record.nextSeq
      record.nextSeq = next + 1
      record.entries.push({seq: next, kind: 'turn', text: entry.text, state: 'queued', notBefore, tier,
        at: now(), stateAt: now(), requeueOf: seq})
      // The text moves to the new entry: one copy, which Cancel can drop.
      delete entry.text
      return next
    }) || null,
    cancel: (seq) => Boolean(mutate((record) => {
      if (!settleIn(record, seq, 'cancelled')) {
        return false
      }
      // The user took the text back; the log keeps no copy of it.
      delete findTurn(record, seq).text
      return true
    })),
    turn: (seq) => {
      const record = read()
      return (record && findTurn(record, seq)) ?? null
    },
    queuedTurn: () => {
      const record = read()
      const queued = record ? record.entries.filter((e) => e.kind === 'turn' && e.state === 'queued') : []
      return queued.length > 0 ? queued[queued.length - 1] : null
    },
    clear: () => {
      memory = null
      if (store) {
        try {
          store.removeItem(keys.log)
        } catch {
          // ignore
        }
      }
    },
    isPersistent: () => store !== null,
  }
}


/**
 * Remove every expired or unreadable session log from storage: the logs of models not opened again, which no open log reaches.
 *
 * @param {object} [deps]
 * @param {?Storage} [deps.storage]
 * @param {Function} [deps.now]
 * @return {number} how many entries were removed
 */
export function sweepAssistLogs({storage = defaultStorage(), now = Date.now} = {}) {
  if (!storage) {
    return 0
  }
  let removed = 0
  try {
    const keys = []
    for (let i = 0; i < storage.length; i++) {
      keys.push(storage.key(i))
    }
    for (const key of keys) {
      let drop = false
      if (isAssistLogKey(key)) {
        drop = parseRecord(storage.getItem(key), key, now()) === null
      }
      if (drop) {
        storage.removeItem(key)
        removed++
      }
    }
  } catch {
    // Storage went away mid-sweep: the rest waits for the next load.
  }
  return removed
}


/**
 * @param {object} value plain JSON
 * @return {object} a deep copy
 */
function structuredCloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}
