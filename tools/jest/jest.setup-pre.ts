import {server} from './server' // setupServer(...handlers)

// IMPORTANT: start immediately so early module imports are intercepted
server.listen({onUnhandledRequest: 'bypass'})

// Optional: short-circuit analytics very early
// (helps even if MSW somehow isn't ready yet)
Object.defineProperty(globalThis, 'dataLayer', {value: [], writable: true})
// eslint-disable-next-line no-empty-function
globalThis.gtag = () => {}
