/* eslint-disable no-magic-numbers */
import {AssistError, assistErrorMessage, classifyError} from './assistError'


describe('assist/assistError', () => {
  it('classifies the AI SDK\'s errors by shape', () => {
    const api = (statusCode) => Object.assign(new Error('x'), {name: 'AI_APICallError', statusCode})
    expect(classifyError(api(401))).toEqual({code: 'bad_key', status: 401})
    expect(classifyError(api(429))).toEqual({code: 'rate_limited', status: 429})
    // After retries, the SDK wraps the last error.
    expect(classifyError(Object.assign(new Error('r'), {name: 'AI_RetryError', lastError: api(429)})))
      .toEqual({code: 'rate_limited', status: 429})
    // An API error with no status: fetch never got an answer.
    expect(classifyError(Object.assign(new Error('Cannot connect'), {name: 'AI_APICallError',
      cause: new TypeError('Failed to fetch')}))).toEqual({code: 'network'})
    expect(classifyError(new TypeError('Failed to fetch'))).toEqual({code: 'network'})
    expect(classifyError(new DOMException('stopped', 'AbortError'))).toEqual({code: 'aborted'})
    expect(classifyError(api(401), true)).toEqual({code: 'aborted'})
    expect(classifyError(new AssistError('no_key', 'none'))).toEqual({code: 'no_key'})
    expect(classifyError(new Error('???'))).toEqual({code: 'provider'})
  })

  it('words each code with what to do, naming the provider', () => {
    expect(assistErrorMessage('bad_key', 'OpenRouter')).toMatch(/OpenRouter didn't accept your key\. Check it/)
    expect(assistErrorMessage('no_credits', 'OpenRouter')).toMatch(/out of credits/)
    expect(assistErrorMessage('rate_limited', 'OpenRouter')).toMatch(/Wait a minute/)
    expect(assistErrorMessage('network', 'OpenRouter')).toMatch(/Check your connection/)
    expect(assistErrorMessage('provider', 'OpenRouter', 500)).toMatch(/HTTP 500/)
  })
})
