import {setupWorker} from 'msw/browser'
import {initHandlers} from './api-handlers'


/**
 * Configures a MSW Worker with the given request handlers.
 *
 * @param {object} defines Object mapping keys like 'process.env.VAR' to values.
 * @return {object} the worker
 */
export function initWorker(defines) {
  const worker = setupWorker(...initHandlers(defines))
  return worker
}
