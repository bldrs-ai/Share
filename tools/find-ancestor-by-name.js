// find-ancestor-by-name.js
// Node >=14
import {execFile} from 'node:child_process'
import os from 'node:os'


/**
 * Executes a command asynchronously and returns a promise.
 *
 * @param {string} cmd - The command to execute.
 * @param {string[]} args - The arguments to pass to the command.
 * @param {object} opts - The options to pass to the command.
 * @return {Promise<{stdout: string, stderr: string}>} A promise that resolves to the stdout and stderr of the command.
 */
function execFileAsync(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, {windowsHide: true, ...opts}, (err, stdout, stderr) => {
      if (err) {
        return reject(Object.assign(err, {stdout, stderr}))
      }
      resolve({stdout, stderr})
    })
  })
}

/**
 * Get minimal proc info for a pid: { pid, ppid, name, cmd }
 * Cross-platform: macOS/Linux via `ps`; Windows via PowerShell/WMIC.
 *
 * @param {number} pid - The process ID to get info for.
 * @return {Promise<{pid: number, ppid: number, name: string, cmd: string}>} A promise that resolves to the process info.
 */
async function getProcInfo(pid) {
  if (pid === null) {
    return null
  }

  if (os.platform() === 'win32') {
    // Try PowerShell first
    try {
      // - NoProfile for speed; Select exact fields; Use -ErrorAction to avoid UI noise
      const ps = [
        '-NoProfile',
        '-Command',
        `Try {
            $p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}";
            if ($p) {
              "$($p.ProcessId)|$($p.ParentProcessId)|$($p.Name)|$($p.CommandLine)"
            }
          } Catch { }
        `,
      ]
      const {stdout} = await execFileAsync('powershell.exe', ps)
      const line = stdout.trim()
      if (line) {
        const [pidStr, ppidStr, name, ...cmdParts] = line.split('|')
        const cmd = cmdParts.join('|') // in case command line had pipes
        return {
          pid: Number(pidStr),
          ppid: Number(ppidStr),
          name: name || '',
          cmd: cmd || '',
        }
      }
    } catch {
      // fall through to WMIC
    }

    try {
      const {stdout} = await execFileAsync('wmic', [
        'process',
        'where',
        `processid=${pid}`,
        'get',
        'ProcessId,ParentProcessId,Name,CommandLine',
        '/FORMAT:CSV',
      ])
      // CSV lines look like: Node,ParentProcessId,Name,ProcessId,CommandLine
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean)
      const dataLine = lines.find((l) => l && !l.startsWith('Node') && l.includes(','))
      if (dataLine) {
        const parts = dataLine.split(',')
        // WMIC CSV can reorder columns inconsistently; rebuild using header
        const header = lines.find((l) => l.startsWith('Node,'))
        const cols = header.split(',')
        const obj = {}
        cols.forEach((col, i) => (obj[col] = parts[i]))
        return {
          pid: Number(obj.ProcessId || 0),
          ppid: Number(obj.ParentProcessId || 0),
          name: obj.Name || '',
          cmd: obj.CommandLine || '',
        }
      }
    } catch {
      // give up
    }

    return null
  }

  // macOS / Linux / other Unix via `ps`
  try {
    // -o with exact fields; "=" removes headers
    // comm is executable name; command is full cmdline (may be truncated by ps)
    const {stdout} = await execFileAsync('ps', ['-p', String(pid), '-o', 'ppid=,comm=,command='])
    const line = stdout.trim()
    if (!line) {
      return null
    }

    // Line format: "<ppid> <comm> <command...>"
    // ppid is first token; comm is next token (no spaces); command is the rest
    const [ppidStr, comm, ...rest] = line.split(/\s+/)
    const cmd = rest.join(' ')
    return {
      pid: Number(pid),
      ppid: Number(ppidStr),
      name: comm || '',
      cmd: cmd || '',
    }
  } catch {
    return null
  }
}

/**
 * Walk ancestors starting at `startPid` (defaults to current process)
 * and return the first ancestor whose name or command line matches `matcher`.
 *
 * @param {object} opts
 * @param {number} [opts.startPid] - pid to start from
 * @param {RegExp | string | Function} opts.matcher - regex | substring | predicate(info)=>boolean
 * @param {number} [opts.maxDepth] - safety cap to avoid infinite loops
 * @param {boolean} [opts.includeSelf] - whether to test startPid itself
 * @return {Promise<null | {pid, ppid, name, cmd, depth}>}
 */
export async function findAncestorByName(opts = {}) {
  const {
    startPid = process.pid,
    matcher,
    maxDepth = 50,
    includeSelf = false,
  } = opts

  if (!matcher) {
    throw new Error('findAncestorByName: opts.matcher is required')
  }

  const test = (info) => {
    if (typeof matcher === 'function') {
      return !!matcher(info)
    }
    if (matcher instanceof RegExp) {
      return matcher.test(info.name) || matcher.test(info.cmd)
    }
    const s = String(matcher).toLowerCase()
    return info.name.toLowerCase().includes(s) || info.cmd.toLowerCase().includes(s)
  }

  let currentPid = startPid
  let depth = 0

  while (depth <= maxDepth && currentPid && currentPid !== 0 && currentPid !== 1) {
    const info = await getProcInfo(currentPid)
    if (!info) {
      return null
    }

    if ((depth === 0 && includeSelf) || depth > 0) {
      if (test(info)) {
        return {...info, depth}
      }
    }

    // Move to parent
    depth += 1
    currentPid = info.ppid
  }

  return null
}
