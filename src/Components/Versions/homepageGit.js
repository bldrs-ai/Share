import {Buffer} from 'buffer'
import {log, resolveRef} from 'isomorphic-git'


const GIT_DIRECTORY = 'repository'
const PUBLISHED_FILE = /^(HEAD|refs\/heads\/(main|dev)|objects\/[0-9a-f]{2}\/[0-9a-f]{38})$/
const NOT_FOUND = 404
const MILLIS_PER_SECOND = 1000


/**
 * Reject unused operations required by the Git filesystem interface.
 *
 * @return {Promise<never>}
 */
function unsupported() {
  return Promise.reject(new Error('The homepage Git filesystem is read-only and contains loose objects'))
}


/**
 * Read the demo's Git refs and commit objects over same-origin HTTP. The build
 * publishes loose objects only. The timeline reads commit metadata, so the
 * geometries are first fetched when a revision is opened via the IFC loader.
 *
 * @param {URL} repository Static Git directory
 * @return {Promise<object>} Timeline entries and the live revision
 */
export async function readHomepageHistory(repository) {
  // The ESM build of isomorphic-git expects Buffer in the browser. Load the
  // polyfill here with the lazy Git client so opening the homepage stays cheap.
  globalThis.Buffer ??= Buffer
  const fs = {
    promises: {
      async readFile(path, options) {
        const relativePath = path?.slice(GIT_DIRECTORY.length + 1)
        if (!PUBLISHED_FILE.test(relativePath)) {
          return undefined
        }
        const response = await fetch(new URL(relativePath, repository))
        if (!response.ok) {
          throw Object.assign(new Error(`Homepage Git request returned ${response.status}`), {
            code: response.status === NOT_FOUND ? 'ENOENT' : 'EIO',
          })
        }
        return options?.encoding ? response.text() : new Uint8Array(await response.arrayBuffer())
      },
      writeFile: unsupported,
      mkdir: unsupported,
      rmdir: unsupported,
      unlink: unsupported,
      stat: unsupported,
      lstat: unsupported,
      readlink: unsupported,
      symlink: unsupported,
      readdir: () => Promise.resolve([]), // There are no pack files to search.
    },
  }
  const git = {fs, gitdir: GIT_DIRECTORY}
  const [main, history] = await Promise.all([
    resolveRef({...git, ref: 'refs/heads/main'}),
    log({...git, ref: 'refs/heads/dev'}),
  ])
  return {
    main,
    commits: history.map(({oid, commit}) => ({
      sha: oid,
      authorName: commit.author.name,
      commitDate: new Date(commit.author.timestamp * MILLIS_PER_SECOND).toISOString().slice(0, 10),
      commitMessage: commit.message.trim(),
    })),
  }
}
