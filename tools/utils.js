import {execFileSync} from 'node:child_process'


/**
 * This is a crazy scheme to get a port number that is unique to the playwright process
 * and not already in use.
 *
 * @return {number} The port number
 */
export function runGetPortPlease() {
  // Invoke helper to get port from stdout
  const stdOut = execFileSync('node', ['tools/get-port-please.js'], {encoding: 'utf8'}).trim()
  // extract port number from stdout
  // eslint-disable-next-line no-control-regex
  const clean = stdOut.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '').trim() // remove ANSI escapes and newlines/spaces

  const portMatch = clean.match(/^(\d+)$/)
  if (!portMatch) {
    throw new Error(`playwright.config: invalid stdOut: '${stdOut}'`)
  }
  const port = parseInt(portMatch[1])
  if (isNaN(port)) {
    throw new Error(`playwright.config: invalid port: ${port}`)
  }
  return port
}
