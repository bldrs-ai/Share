import {captureMessage} from '@sentry/react'
import {loadFailureCaptureContext} from '../loader/loadProgress'
import {gtagEvent} from '../privacy/analytics'
import {
  downloadSourceKind,
  reportOpfsDownloadFailed,
  reportOpfsNotCached,
  reportOpfsSourceEvicted,
} from './reportOpfsSourceCondition'


jest.mock('@sentry/react', () => ({captureMessage: jest.fn()}))
jest.mock('../loader/loadProgress', () => ({loadFailureCaptureContext: jest.fn()}))
jest.mock('../privacy/analytics', () => ({gtagEvent: jest.fn()}))

const SECRET_PATH = 'secret-org/secret-repo/main/private.ifc'


describe('reportOpfsSourceCondition', () => {
  beforeEach(() => {
    captureMessage.mockReset()
    gtagEvent.mockReset()
    // What a live load hands over: CadView sets fileInfo from the raw
    // filepath, so for a private source it is the path.
    loadFailureCaptureContext.mockReset()
    loadFailureCaptureContext.mockReturnValue({
      tags: {'load.phase': 'download', 'load.file': SECRET_PATH},
      contexts: {
        load: {
          phase: 'download', completed: 1, total: 2, unit: 'bytes', elapsedMs: 5, memoryMb: 10,
          fileInfo: SECRET_PATH,
          fileName: 'private.ifc',
          report: 'Source: OPFS entry was truncated',
        },
      },
    })
  })

  it('counts an eviction in GA with exactly kind and condition, and sends nothing to Sentry', () => {
    reportOpfsSourceEvicted('external')

    expect(gtagEvent).toHaveBeenCalledTimes(1)
    expect(gtagEvent).toHaveBeenCalledWith('opfs_source_evicted', {kind: 'external', condition: 'evicted'})
    expect(captureMessage).not.toHaveBeenCalled()
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

  it('counts an uncached download in GA with exactly kind and condition, and sends nothing to Sentry', () => {
    reportOpfsNotCached('local')

    expect(gtagEvent).toHaveBeenCalledTimes(1)
    expect(gtagEvent).toHaveBeenCalledWith('opfs_not_cached', {kind: 'local', condition: 'move-unavailable'})
    expect(captureMessage).not.toHaveBeenCalled()
  })

  it('sends a failed download to Sentry only, not GA', () => {
    reportOpfsDownloadFailed({kind: 'external', condition: 'http-error', status: 404})

    expect(captureMessage).toHaveBeenCalledTimes(1)
    expect(gtagEvent).not.toHaveBeenCalled()
  })

  it('carries no URL, host or file name, whatever the caller held', () => {
    // The helpers take no path or message, so a private source's name can't
    // get in; this pins that the event stays that way.
    reportOpfsSourceEvicted('external')
    reportOpfsDownloadFailed({kind: 'external', condition: 'http-error', status: 500})
    reportOpfsNotCached('local')

    const everything = JSON.stringify(captureMessage.mock.calls)
    expect(everything).not.toMatch(/https?:|\.ifc|\.obj|secret|\//)
    // GA gets no load context either: its params are the seeded path's opposite.
    expect(JSON.stringify(gtagEvent.mock.calls)).not.toMatch(/secret|private\.ifc|https?:|\.ifc|\//)
  })

  it('carries the load phase and report but not the load context\'s file identity', () => {
    // Red if the whole loadFailureCaptureContext() is spread back onto the
    // event: its `fileInfo` is the raw path of a private model.
    reportOpfsDownloadFailed({kind: 'external', condition: 'http-error', status: 500})

    expect(captureMessage).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(captureMessage.mock.calls)).not.toMatch(/secret|private\.ifc/)
    const [, context] = captureMessage.mock.calls[0]
    expect(context.tags['load.phase']).toBe('download')
    expect(context.contexts.load).toEqual({
      phase: 'download', completed: 1, total: 2, unit: 'bytes', elapsedMs: 5, memoryMb: 10,
      report: 'Source: OPFS entry was truncated',
    })
  })

  it('sends no load context, path or file name to GA', () => {
    // The load context is seeded with a private-looking path in beforeEach.
    reportOpfsSourceEvicted('github')
    reportOpfsNotCached('external')

    expect(gtagEvent).toHaveBeenCalledTimes(2)
    for (const [, params] of gtagEvent.mock.calls) {
      expect(Object.keys(params).sort()).toEqual(['condition', 'kind'])
    }
    expect(JSON.stringify(gtagEvent.mock.calls)).not.toMatch(/secret|private\.ifc/)
  })

  it('never throws when Sentry does', () => {
    captureMessage.mockImplementation(() => {
      throw new Error('sentry down')
    })

    gtagEvent.mockImplementation(() => {
      throw new Error('ga down')
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
