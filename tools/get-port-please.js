import path from 'node:path'
import fs from 'fs'
import {getPort} from 'get-port-please'


export default async () => {
  const port = String(await getPort({random: true}))
  const url = `http://localhost:${port}`
  fs.writeFileSync('/tmp/.pw-env.json', JSON.stringify({port, url}))
}


const file = path.resolve('.pw-run-port')

try {
  // Try to create the file exclusively — only one process wins
  const fd = fs.openSync(file, 'wx')
  const port = await getPort({random: true})
  fs.writeFileSync(fd, String(port))
  fs.closeSync(fd)
  process.stdout.write(String(port))
} catch (err) {
  if (err.code === 'EEXIST') {
    // Another process already created it — just read it
    const port = fs.readFileSync(file, 'utf8').trim()
    process.stdout.write(port)
  } else {
    throw err
  }
}
