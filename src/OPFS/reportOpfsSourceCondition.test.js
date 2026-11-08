import {captureMessage} from '@sentry/react'
import {
  downloadSourceKind,
  reportOpfsDownloadFailed,
  reportOpfsNotCached,
  reportOpfsSourceEvicted,
} from './reportOpfsSourceCondition'


jest.mock('@sentry/react', () => ({captureMessage: jest.fn()}))


describe('reportOpfsSourceCondition', () => {
  beforeEach(() => {
    captureMessage.mockReset()
  })

  it('reports an eviction as one info event with a per-kind fingerprint', () => {
    reportOpfsSourceEvicted('external')

    expect(captureMessage).toHaveBeenCalledTimes(1)
    const [message, context] = captureMessage.mock.calls[0]
    expect(message).toBe('OPFS source entry was empty or truncated; evicted')
    expect(context.level).toBe('info')
    expect(context.fingerprint).toEqual(['opfs-source', 'evicted', 'external'])
    expect(context.tags).toMatchObject({kind: 'external', condition: 'evicted'})
  })

  it('reports a failed download as one warning with the status as a tag', () => {
    reportOpfsDownloadFailed({kind: 'local', condition: 'http-error', status: 404})

    expect(captureMessage).toHaveBeenCalledTimes(1)
    const [, context] = captureMessage.mock.calls[0]
    expect(context.level).toBe('warning')
    expect(context.fingerprint).toEqual(['opfs-source', 'download-failed', 'http-error', 'local'])
    expect(context.tags).toMatchObject({kind: 'local', condition: 'http-error', http_status: '404'})
  })

  it('omits the status tag when the condition has none', () => {
    reportOpfsDownloadFailed({kind: 'external', condition: 'fetch-rejected'})

    expect(captureMessage.mock.calls[0][1].tags).not.toHaveProperty('http_status')
  })

  it('reports an uncached download as one info event', () => {
    reportOpfsNotCached('external')

    expect(captureMessage).toHaveBeenCalledTimes(1)
    const [, context] = captureMessage.mock.calls[0]
    expect(context.level).toBe('info')
    expect(context.fingerprint).toEqual(['opfs-source', 'not-cached', 'move-unavailable', 'external'])
    expect(context.tags).toMatchObject({kind: 'external', condition: 'move-unavailable'})
  })

  it('carries no URL, host or file name, whatever the caller held', () => {
    // The helpers take no path or message, so a private source's name can't
    // get in; this pins that the event stays that way.
    reportOpfsSourceEvicted('external')
    reportOpfsDownloadFailed({kind: 'external', condition: 'http-error', status: 500})
    reportOpfsNotCached('local')

    const everything = JSON.stringify(captureMessage.mock.calls)
    expect(everything).not.toMatch(/https?:|\.ifc|\.obj|secret|\//)
  })

  it('never throws when Sentry does', () => {
    captureMessage.mockImplementation(() => {
      throw new Error('sentry down')
    })

    expect(() => reportOpfsSourceEvicted('github')).not.toThrow()
    expect(() => reportOpfsDownloadFailed({kind: 'local', condition: 'no-body'})).not.toThrow()
    expect(() => reportOpfsNotCached('local')).not.toThrow()
  })

  it('names a Share-hosted path local and every other host external', () => {
    expect(downloadSourceKind('bldrs-ai')).toBe('local')
    expect(downloadSourceKind('example.com')).toBe('external')
  })
})
