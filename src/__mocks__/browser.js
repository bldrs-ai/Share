import {setupWorker} from 'msw'
import {initHandlers} from './api-handlers'


/**
 * Configures a Service Worker with the given request handlers.
 *
 * @param {object} defines
 * @return {object} the worker
 */
export function initWorker(defines) {
  const worker = setupWorker(...initHandlers(defines))
  return worker
}
