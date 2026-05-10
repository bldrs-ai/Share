/**
 * GitHub SourceBrowser implementation.
 *
 * Mirrors GoogleDriveBrowser.ts but talks to the GitHub Contents API:
 *   listFiles    →  GET /repos/{owner}/{repo}/contents/{path}?ref={branch}
 *   getFileDown  →  same endpoint with `Accept: application/vnd.github.raw`
 *
 * pickLocation is intentionally a thrower: GitHub repo+branch+folder
 * selection is a multi-step flow with org/repo lookups, so the OpenModelDialog
 * GitHub flow drives picking via GitHubFileBrowser and stores the resulting
 * GitHubLocation back on the Source.
 *
 * Auth comes from the connection's GitHubProvider, not from the legacy
 * Auth0-federated `useStore.accessToken` used by src/net/github/. Once
 * SourcesTab is wired to use this browser, the legacy fetch path can
 * retire.
 *
 * Errors are mapped to typed connection errors so the UI can route
 * recoverable cases (401 → re-auth) distinctly from fatal ones. 403
 * (rate-limit / scope / repo permission) and other non-2xx surface as
 * generic Errors with `status` preserved for callers to interpret.
 */

import type {
  Connection,
  Source,
  SourceBrowser,
  SourceLocation,
  FileListResult,
  FileDownloadResult,
  SourceFile,
  SourceFolder,
  GitHubLocation,
} from '../types'
import {NeedsReconnectError} from '../errors'
import {githubProvider} from './GitHubProvider'


const GITHUB_API_BASE = 'https://api.github.com'
const GITHUB_RAW_ACCEPT = 'application/vnd.github.raw'
const GITHUB_JSON_ACCEPT = 'application/vnd.github+json'
const GITHUB_API_VERSION = '2022-11-28'

const HTTP_UNAUTHORIZED = 401


/**
 * Build common headers for GitHub Contents API calls.
 *
 * @param token GitHub access token from the connection.
 * @param accept Accept header value (JSON for listings, raw for downloads).
 * @return Headers object.
 */
function ghHeaders(token: string, accept: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': accept,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  }
}


/**
 * Build the Contents API URL for a given location + optional path override.
 *
 * @param location GitHub source location.
 * @param pathOverride If provided, replace the location's path.
 * @return Encoded URL string.
 */
function contentsUrl(location: GitHubLocation, pathOverride?: string): string {
  const path = pathOverride ?? location.path ?? ''
  // Encode each path segment to handle spaces/special chars but keep slashes
  // as separators — GitHub treats the raw path as a tree walk.
  const encoded = path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
  const branch = encodeURIComponent(location.branch)
  const org = encodeURIComponent(location.org)
  const repo = encodeURIComponent(location.repo)
  return `${GITHUB_API_BASE}/repos/${org}/${repo}/contents/${encoded}?ref=${branch}`
}


/**
 * Map a non-OK GitHub response to a typed connection error.
 *
 * 401 → NeedsReconnectError so the UI can offer Reconnect.
 * Anything else throws a generic Error preserving status + body — callers
 * decide how to surface (toast, retry, etc.).
 *
 * @param res Failed Response from fetch.
 * @param connection Connection (for NeedsReconnectError context).
 * @param contextMsg Human-readable label of what failed.
 * @return Never — always throws.
 */
async function throwGhError(res: Response, connection: Connection, contextMsg: string): Promise<never> {
  const text = await res.text().catch(() => '')
  if (res.status === HTTP_UNAUTHORIZED) {
    throw new NeedsReconnectError(
      connection,
      'unauthorized',
      `${contextMsg}: GitHub returned 401 (token revoked or expired)`,
    )
  }
  // 403 from the Contents API can be rate-limit, scope, or repo permission.
  // Surface the body — it carries `message` + `documentation_url` which the
  // user-facing layer can choose to interpret.
  const err = new Error(`${contextMsg}: ${res.status} ${text}`) as Error & {status?: number}
  err.status = res.status
  throw err
}


export const githubBrowser: SourceBrowser = {
  providerId: 'github',

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  pickLocation(_connection: Connection): Promise<SourceLocation | null> {
    // Repo/branch/folder selection is a multi-step UI flow (org list →
    // repos → branches → tree) so the user's gestures drive picking via
    // GitHubFileBrowser inside OpenModelDialog. This method exists to
    // satisfy the SourceBrowser interface; calling it is a wiring bug,
    // not a runtime path.
    throw new Error(
      'Use OpenModelDialog\'s GitHub flow (GitHubFileBrowser) for interactive repo/branch selection.',
    )
  },

  async listFiles(
    connection: Connection,
    source: Source,
    path?: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _pageToken?: string,
  ): Promise<FileListResult> {
    // GitHub Contents API doesn't paginate folder listings — it returns
    // the whole tree at the requested level. The pageToken parameter is
    // accepted for SourceBrowser parity and ignored.
    const token = await githubProvider.getAccessToken(connection)
    const location = source.location as GitHubLocation
    const url = contentsUrl(location, path)

    const res = await fetch(url, {
      headers: ghHeaders(token, GITHUB_JSON_ACCEPT),
    })
    if (!res.ok) {
      await throwGhError(res, connection, `listFiles ${location.org}/${location.repo}`)
    }

    const data = await res.json()

    // The Contents API returns an array for directories and an object for
    // single files. listFiles is only meaningful on directories; if we
    // somehow got a file, surface a clear error rather than silently
    // returning empty.
    if (!Array.isArray(data)) {
      throw new Error(
        `listFiles expected a directory at ${location.org}/${location.repo}/${path ?? location.path ?? ''} but got a file`,
      )
    }

    const files: SourceFile[] = []
    const folders: SourceFolder[] = []

    for (const item of data) {
      if (item.type === 'dir') {
        folders.push({
          id: item.path, // GitHub uses paths, not opaque IDs
          name: item.name,
        })
      } else if (item.type === 'file') {
        files.push({
          id: item.path,
          name: item.name,
          size: typeof item.size === 'number' ? item.size : undefined,
          // The Contents API doesn't include modifiedAt; the Tree/Commits
          // API does, but pulling it here would require an extra round
          // trip per file. Leave undefined; callers that need it can
          // resolve via /commits?path=.
          meta: item.sha ? {sha: item.sha} : undefined,
        })
      }
      // Skip 'symlink' and 'submodule' — viewer can't open either.
    }

    // No native pagination; sort folders-first then alphabetical for parity
    // with Drive's `orderBy: 'folder,name'`.
    folders.sort((a, b) => a.name.localeCompare(b.name))
    files.sort((a, b) => a.name.localeCompare(b.name))

    return {files, folders}
  },

  async getFileDownload(
    connection: Connection,
    source: Source,
    fileId: string,
  ): Promise<FileDownloadResult> {
    const token = await githubProvider.getAccessToken(connection)
    const location = source.location as GitHubLocation
    // fileId is the GitHub path (set in listFiles). Pass it as the path
    // override — Contents API resolves directory or file based on the
    // resource's actual type.
    const url = contentsUrl(location, fileId)

    // Two requests: one for metadata (filename, size, sha) and one for
    // the raw blob. We could use the `download_url` from the metadata
    // response instead — that hits raw.githubusercontent.com directly —
    // but it requires a separate Authorization mechanism for private
    // repos and doesn't honor X-GitHub-Api-Version pinning. Two requests
    // against api.github.com keep auth + rate-limit accounting in one
    // place.
    const metaRes = await fetch(url, {
      headers: ghHeaders(token, GITHUB_JSON_ACCEPT),
    })
    if (!metaRes.ok) {
      await throwGhError(metaRes, connection, `getFileDownload meta ${fileId}`)
    }
    const meta = await metaRes.json()
    if (Array.isArray(meta) || meta.type !== 'file') {
      throw new Error(`getFileDownload: ${fileId} is not a file`)
    }

    const blobRes = await fetch(url, {
      headers: ghHeaders(token, GITHUB_RAW_ACCEPT),
    })
    if (!blobRes.ok) {
      await throwGhError(blobRes, connection, `getFileDownload blob ${fileId}`)
    }
    const blob = await blobRes.blob()

    return {
      blob,
      filename: meta.name,
      // The Contents API doesn't return MIME type — let the caller infer
      // from the extension (matches how IFC viewer dispatches today).
      // modifiedAt is also unavailable from this endpoint.
    }
  },
}
