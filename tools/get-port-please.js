// Invoked from utils.js to get a port number that is unique to
// the playwright process.  Total facepalm worthy.
import {getPort} from 'get-port-please'
import {findAncestorByName} from './find-ancestor-by-name.js'

// So basically, if we can find the playwright ancestor process,
// we can use the process ID to get a port number that is unique
// to the playwright process.  If not, try 8080, or again search
// that range.  Should be stable for most use cases.
const minPort = 20000
const maxPort = 29999
let desiredPort = 8080
const ancestor = await findAncestorByName({matcher: /.bin\/playwright/i})
if (ancestor) {
  const rangeSize = maxPort - minPort
  desiredPort = minPort + (ancestor.pid % rangeSize)
} else {
  console.error('Playwright ancestor process not identified')
}

// Parent parses stdout to get port number
// eslint-disable-next-line no-console
console.log(await getPort({port: desiredPort, range: [minPort, maxPort]}))
