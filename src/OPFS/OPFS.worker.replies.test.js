/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
import fs from 'fs'
import path from 'path'


/*
 * Static guard for Share#2107. Every error reply the OPFS worker posts
 * carries a stable structured `condition` beside its text. The text
 * interpolates cache keys, file paths and file names, so the page can neither
 * report it nor let Sentry keep it (privacy/sentryRedaction.js withholds it
 * from breadcrumbs); `condition` is what it may send. A new error reply with
 * no condition is a reply the page can only log or leak.
 */

// Well under today's count; a parser that stopped matching would find none.
const MIN_ERROR_REPLIES = 30
const WORKER_SOURCE = fs.readFileSync(path.join(__dirname, 'OPFS.worker.js'), 'utf8')


/**
 * The argument text of every `<callee>(...)` call in `source`, found by
 * balancing parentheses and skipping over string and template literals (the
 * worker's texts contain `(${error})`).
 *
 * @param {string} source
 * @param {string} callee e.g. 'postReply'
 * @return {string[]} each call's text between its outer parentheses
 */
function callArguments(source, callee) {
  const calls = []
  const needle = `${callee}(`
  let from = 0
  for (;;) {
    const start = source.indexOf(needle, from)
    if (start === -1) {
      return calls
    }
    let depth = 0
    let quote = null
    let i = start + callee.length
    for (; i < source.length; i++) {
      const c = source[i]
      if (quote) {
        if (c === '\\') {
          i++
        } else if (c === quote) {
          quote = null
        }
      } else if (c === '\'' || c === '"' || c === '`') {
        quote = c
      } else if (c === '(') {
        depth++
      } else if (c === ')' && --depth === 0) {
        break
      }
    }
    calls.push(source.slice(start + needle.length, i))
    from = i
  }
}


/**
 * @param {string} call a postReply call's arguments
 * @return {boolean} whether its payload is an error reply
 */
function isErrorReply(call) {
  // `error: …`, or the shorthand `{error}` / `{…, error}`.
  return /(^|[{,\s])error\s*(:|[,}])/.test(call)
}


// A condition the page can trust is a literal, or a choice between two
// literals (`isLockedEntryError(error) ? 'entry-locked' : 'delete-failed'`).
// Anything else (`condition: x`, `condition: x || 'a'`) could carry the
// worker's text.
const LITERAL_CONDITION =
  /\bcondition\s*:\s*(?:'[a-z][a-z-]*'|[^,{}?:]+\?\s*'[a-z][a-z-]*'\s*:\s*'[a-z][a-z-]*')\s*[,}]/


/**
 * @param {string[]} calls
 * @return {string[]} the error replies with no literal `condition`
 */
function errorRepliesWithoutCondition(calls) {
  return calls.filter((call) => isErrorReply(call) && !LITERAL_CONDITION.test(call))
}


describe('OPFS.worker error replies (Share#2107)', () => {
  const calls = callArguments(WORKER_SOURCE, 'postReply')

  it('finds the worker\'s error replies, so the checks below are not vacuous', () => {
    // 40 today; a parser that stopped matching would find none.
    expect(calls.filter(isErrorReply).length).toBeGreaterThan(MIN_ERROR_REPLIES)
  })

  it('gives every error reply a literal structured condition', () => {
    expect(errorRepliesWithoutCondition(calls)).toEqual([])
  })

  it('builds every reply in the call, where this test can see it', () => {
    // A payload made elsewhere (`postReply(reply, id)`) is invisible to the
    // checks above. The definition itself is the one call that isn't one.
    const hidden = calls.filter((call) => !call.trimStart().startsWith('{') && call !== 'message, requestId')
    expect(hidden).toEqual([])
  })

  it('posts no error except through postReply', () => {
    // postReply stamps the request id; a raw self.postMessage error would be
    // uncorrelated and outside this guard.
    const raw = callArguments(WORKER_SOURCE, 'self.postMessage').filter(isErrorReply)
    expect(raw).toEqual([])
  })

  it('catches a reply that interpolates a path and has no condition', () => {
    const planted = callArguments(
      'postReply({error: `Error writing ${originalFilePath}: ${error}`}, requestId)', 'postReply')
    expect(errorRepliesWithoutCondition(planted)).toHaveLength(1)
    const fixed = callArguments(
      'postReply({error: `Error writing ${originalFilePath}`, condition: \'write-failed\'}, requestId)', 'postReply')
    expect(errorRepliesWithoutCondition(fixed)).toEqual([])
  })

  it('catches the shapes a looser check let through', () => {
    const shapes = [
      // Shorthand key, no condition.
      'postReply({error}, requestId)',
      // A condition that is not a literal, or could fall through to text.
      'postReply({error: text, condition: kind}, requestId)',
      'postReply({error: text, condition: kind || \'write-failed\'}, requestId)',
    ]
    for (const shape of shapes) {
      expect(errorRepliesWithoutCondition(callArguments(shape, 'postReply'))).toHaveLength(1)
    }
    // The ternary of two literals the worker uses passes.
    const ternary = 'postReply({error: text, condition: isLocked(e) ? \'entry-locked\' : \'delete-failed\'}, id)'
    expect(errorRepliesWithoutCondition(callArguments(ternary, 'postReply'))).toEqual([])
  })
})
