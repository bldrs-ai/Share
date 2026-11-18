/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
/*
 * The relay's usage watcher (`_lib/aiSse.js`): the final chunk's
 * `usage.cost`, however the bytes are split on the way in.
 */
import {createUsageWatcher} from '../_lib/aiSse.js'


/* eslint-disable no-magic-numbers */
const encoder = new TextEncoder()

const STREAM = [
  ': OPENROUTER PROCESSING\n\n',
  'data: {"id":"gen-123","model":"qwen/qwen3.7-flash","choices":[{"delta":{"content":"Hel"}}]}\n\n',
  'data: {"id":"gen-123","model":"qwen/qwen3.7-flash","choices":[{"delta":{"content":"lo"}}]}\n\n',
  'data: {"id":"gen-123","choices":[],"usage":{"prompt_tokens":120,"completion_tokens":12,' +
    '"total_tokens":132,"cost":0.000143}}\n\n',
  'data: [DONE]\n\n',
].join('')


/**
 * @param {string} text
 * @param {number} size bytes per piece
 * @return {object} the watcher's result after reading `text` in pieces
 */
function watch(text, size) {
  const watcher = createUsageWatcher()
  const bytes = encoder.encode(text)
  for (let i = 0; i < bytes.length; i += size) {
    watcher.push(bytes.slice(i, i + size))
  }
  watcher.end()
  return watcher.result()
}


describe('aiSse', () => {
  it.each([1, 7, 64, 100000])('reads the cost, tokens, generation and model in %i-byte pieces', (size) => {
    expect(watch(STREAM, size)).toMatchObject({
      cost: 0.000143, micro: 143, promptTokens: 120, completionTokens: 12,
      generationId: 'gen-123', model: 'qwen/qwen3.7-flash', done: true, error: false,
    })
  })

  it('rounds the cost up to whole micro-USD, without a float\'s noise', () => {
    const one = (cost) => watch(`data: {"usage":{"cost":${cost}}}\n\n`, 1000).micro
    expect(one(0.00015)).toBe(150)
    expect(one(0.0001501)).toBe(151)
    expect(one(0)).toBe(0)
  })

  it('has no cost for a stream that ended before its usage chunk', () => {
    expect(watch(STREAM.slice(0, STREAM.indexOf('"usage"') - 40), 13)).toMatchObject({cost: null, micro: null})
  })

  it('notes a mid-stream error chunk', () => {
    expect(watch('data: {"error":{"code":502,"message":"upstream"}}\n\n', 10).error).toBe(true)
  })

  it('reads a last line with no trailing newline, and CRLF line ends', () => {
    expect(watch('data: {"usage":{"cost":0.001}}\r\n\r\ndata: [DONE]', 5)).toMatchObject({micro: 1000, done: true})
  })

  it('ignores a negative or non-numeric cost rather than crediting it', () => {
    expect(watch('data: {"usage":{"cost":-1}}\n\ndata: {"usage":{"cost":"0.5"}}\n\n', 9).micro).toBeNull()
  })
})
