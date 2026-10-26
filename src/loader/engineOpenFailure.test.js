import {
  EngineOpenFailureError,
  STATUS_UNRECOGNIZED_FORMAT,
  engineFailureCaptureContext,
} from './engineOpenFailure'


/* eslint-disable no-magic-numbers */
describe('loader/engineOpenFailure — EngineOpenFailureError', () => {
  it('keeps the generic open-failure text as the message prefix, then the reason', () => {
    const err = new EngineOpenFailureError(-1, 'OPEN_FAIL', 'index out of range')
    expect(err.message).toBe('parseIfcWithConway: OpenModel returned -1: index out of range')
    expect(err.name).toBe('EngineOpenFailureError')
    expect(err.status).toBe('OPEN_FAIL')
    expect(err.reason).toBe('index out of range')
  })

  it('words an unrecognised file as unreadable, with the engine\'s own description', () => {
    const err = new EngineOpenFailureError(-1, STATUS_UNRECOGNIZED_FORMAT, 'zip archive (such as .ifczip), not STEP text')
    expect(err.alertMessage).toBe(
      'Share couldn\'t read this file: zip archive (such as .ifczip), not STEP text.')
  })

  it('words any other failure as an unopenable model', () => {
    const err = new EngineOpenFailureError(-1, 'INDEX_RESTORE_FAIL', 'Index-first open produced no model')
    expect(err.alertMessage).toBe('Share couldn\'t open this model: Index-first open produced no model.')
  })

  it('flattens whitespace, drops a trailing period and caps a long exception message', () => {
    const long = `bad\n  thing. ${'x'.repeat(400)}`
    const err = new EngineOpenFailureError(-1, 'OPEN_FAIL', long)
    expect(err.reason).not.toMatch(/\s{2}|\n/)
    expect(err.reason.length).toBeLessThanOrEqual(160)
    expect(err.reason.endsWith('…')).toBe(true)
    expect(new EngineOpenFailureError(-1, 'OPEN_FAIL', 'oops.').reason).toBe('oops')
  })
})


describe('loader/engineOpenFailure — engineFailureCaptureContext', () => {
  it('carries status and reason as tags and context, and splits the default grouping by status', () => {
    const err = new EngineOpenFailureError(-1, STATUS_UNRECOGNIZED_FORMAT,
      'STEP header syntax error at byte 1042 (FILE_SCHEMA IFC4)')
    expect(engineFailureCaptureContext(err)).toEqual({
      tags: {
        'engine.load_status': 'UNRECOGNIZED_FORMAT',
        // Digit runs collapsed so every byte offset is one searchable value.
        'engine.failure_reason': 'STEP header syntax error at byte # (FILE_SCHEMA IFC#)',
      },
      contexts: {
        engine_failure: {
          status: 'UNRECOGNIZED_FORMAT',
          reason: 'STEP header syntax error at byte 1042 (FILE_SCHEMA IFC4)',
        },
      },
      fingerprint: ['{{ default }}', 'UNRECOGNIZED_FORMAT'],
    })
  })
})
