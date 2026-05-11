// Invoked from utils.js to get a port number that is unique to
// the playwright process.  Total facepalm worthy.
import {getPort} from 'get-port-please'
import {findAncestorByName} from './find-ancestor-by-name.js'


// Find the playwright ancestor process and derive a port from its PID. All
// workers under the same playwright invocation share the same ancestor, so
// they all derive the same port — which is what lets PW's webServer (started
// in the main process) be reached by every worker.
//
// Earlier we ran the result through `getPort({port: desired, range:[…]})`
// to "verify it's free" before printing. That call sabotages stability: the
// main process binds the desired port (via webServer), then every subsequent
// worker re-imports the config, calls us again, finds the port taken, and
// `getPort` falls back to scanning — handing each worker a DIFFERENT free
// port. Workers 2..N then point at non-listening ports and tests fail with
// ERR_CONNECTION_REFUSED. The fix is to skip the probe when we have an
// ancestor PID — the PID-derived port is intentionally not a "free port",
// it's a "stable per-invocation port".
//
// Only when the ancestor can't be identified (atypical — e.g. direct
// `node` invocation without the .bin/playwright wrapper) do we fall back
// to the probe to get *any* free port. That path remains imperfect for
// parallel workers but is no worse than before.
const minPort = 20000
const maxPort = 29999
let desiredPort = process.argv.length > 2 ? Number(process.argv[2]) : 0
const ancestor = await findAncestorByName({matcher: /.bin\/playwright/i})
let port
if (ancestor) {
  const rangeSize = maxPort - minPort
  port = minPort + (ancestor.pid % rangeSize)
} else {
  console.warn('Playwright ancestor process not identified — falling back to free-port probe (parallel workers may flake)')
  port = await getPort({port: desiredPort, range: [minPort, maxPort]})
}

// Parent parses stdout to get port number
// eslint-disable-next-line no-console
console.log(port)
