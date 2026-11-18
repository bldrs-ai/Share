import {captureMessage} from '@sentry/react'
import {reportAssistCondition, resetAssistConditionReports} from './reportAssistCondition'


jest.mock('@sentry/react', () => ({captureMessage: jest.fn()}))


describe('Bot/reportAssistCondition', () => {
  beforeEach(() => {
    captureMessage.mockClear()
    resetAssistConditionReports()
  })

  it('sends one warning per condition per page, with structured tags only', () => {
    reportAssistCondition('model_unavailable', {status: 404, transport: 'openrouter'})
    reportAssistCondition('model_unavailable', {status: 404, transport: 'openrouter'})
    expect(captureMessage).toHaveBeenCalledTimes(1)
    expect(captureMessage).toHaveBeenCalledWith('Assist model unavailable', {
      level: 'warning',
      fingerprint: ['assist', 'model_unavailable'],
      tags: {component: 'assist', assist_condition: 'model_unavailable', assist_status: '404',
        assist_transport: 'openrouter'},
    })
  })

  it('ignores a condition it doesn\'t know, and never throws', () => {
    reportAssistCondition('something_else')
    expect(captureMessage).not.toHaveBeenCalled()
    captureMessage.mockImplementationOnce(() => {
      throw new Error('sentry down')
    })
    expect(() => reportAssistCondition('runtime_load_failed')).not.toThrow()
  })
})
