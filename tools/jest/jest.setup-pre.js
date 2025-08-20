import {getAndExportEnvVars} from './vars.jest'


const {initServer} = require('../../src/__mocks__/server')


const server = initServer(getAndExportEnvVars())

server.listen({onUnhandledRequest: 'warn'})

/** @return {object} msw server */
export function getServer() {
  return server
}
