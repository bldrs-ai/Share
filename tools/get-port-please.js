import path from 'node:path'
import fs from 'fs'
import {getPort} from 'get-port-please'
import debug from '../src/utils/debug.js'


const serverConfigFilename = '/tmp/pw-port'

const file = path.resolve(serverConfigFilename)

const port = await getPort({random: true})
let portState
try {
  const fd = fs.openSync(file, 'wx')
  portState = {port, date: new Date}
  fs.writeFileSync(fd, JSON.stringify(portState))
  fs.closeSync(fd)
  debug().error('gpp: Wrote NEW PORT state:', portState)
} catch (err) {
  if (err.code === 'EEXIST') {
    // Another process already created it — just read it
    portState = JSON.parse(fs.readFileSync(file, 'utf8').trim())
    debug().warn('gpp: (FOUND PORT state):', portState)
    if (portState === undefined) {
      throw new Error('Could not read existing port state')
    } else {
      const now = new Date()
      const old = Date.parse(portState.date)
      const oneMin = 60_000
      const fiveMins = 5 * oneMin
      if (now - old < fiveMins) { // TODO
        // In-use file.
        debug().warn('gpp: It\'s new! continuing')
      } else {
        // Old file.  Overwrite.
        const fd = fs.openSync(file, 'w') // NB: no x
        fs.writeFileSync(fd, JSON.stringify({port, date: new Date}))
        fs.closeSync(fd)
        debug().warn('gpp: But it\'s old!  Wrote UPDATED PORT state:', portState, `now: ${now}, old: ${portState.date}`)
      }
    }
  } else {
    throw err
  }
}
