import {setupServer} from 'msw/node'
import {initHandlers} from './api-handlers'


let _server = null


/**
 * Returns the MSW server instance for use in test files (e.g. server.use(...handlers)).
 * Only valid after initServer() has been called by setupTests.js.
 *
 * @return {object} MSW server
 */
export function getServer() {
  return _server
}


/**
 * Configures a MSW server with the given request handlers.
 *
 * @param {object} defines Object mapping keys like 'process.env.VAR' to values.
 * @return {object} the worker
 */
export function initServer(defines) {
  _server = setupServer(...initHandlers(defines))
  return _server
}
