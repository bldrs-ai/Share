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
  return /(^|[{,\s])error\s*:/.test(call)
}


/**
 * @param {string[]} calls
 * @return {string[]} the error replies with no literal `condition`
 */
function errorRepliesWithoutCondition(calls) {
  return calls.filter((call) => isErrorReply(call) && !/\bcondition\s*:[^,}]*'[a-z][a-z-]*'/.test(call))
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
})
