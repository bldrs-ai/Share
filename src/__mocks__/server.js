import {setupServer} from 'msw/node'
import {initHandlers} from './api-handlers'


/**
 * Configures a MSW server with the given request handlers.
 *
 * @param {object} defines Object mapping keys like 'process.env.VAR' to values.
 * @return {object} the worker
 */
export function initServer(defines) {
  const server = setupServer(...initHandlers(defines))
  return server
}
