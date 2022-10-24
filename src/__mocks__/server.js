import {setupServer} from 'msw/node'
import {handlers} from './api-handlers'

// This configures a request mocking server with the given request handlers.
export const server = setupServer(...handlers)
