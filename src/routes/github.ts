import {splitAroundExtensionRemoveFirstSlash} from '../Filetype'
import type {ProviderResult, BaseParams} from './routes'


/**
 * Processes a GitHub file path for remote repository files.
 *
 * @param originalUrl
 * @param filepath - The file path within the repository
 * @param routeParams - URL parameters containing org, repo, branch
 * @return Route object
 */
export default function processGithubParams(
  originalUrl: URL,
  filepath: string,
  routeParams: GithubParams,
): GithubResult {
  const org = routeParams['org']
  const repo = routeParams['repo']
  const branch = routeParams['branch']
  const {parts, extension} = splitAroundExtensionRemoveFirstSlash(filepath)
  const reducedFilePath = `${parts[0]}${extension}`
  const getRepoPath = () => `/${org}/${repo}/${branch}/${reducedFilePath}`
  const downloadUrl = new URL(`https://github.com${getRepoPath()}`)
  const result: GithubResult = {
    originalUrl,
    downloadUrl,
    kind: 'provider',
    provider: 'github',
    org,
    repo,
    branch,
    filepath: reducedFilePath,
    getRepoPath,
    // TODO(pablo): remove this
    gitpath: downloadUrl.toString(),
    ...(parts[1] ? {eltPath: parts[1]} : {}),
  }
  return result
}

// Types
// /share/v/h/:org/:repo/*  (example GitHub route)
export type GithubParams = BaseParams & {
  org: string
  repo: string
  branch: string
}

export const isGithubParams = (p: BaseParams): p is GithubParams =>
  typeof p.org === 'string' && !!p.org && typeof p.repo === 'string' && !!p.repo

export interface GithubResult extends ProviderResult {
  provider: 'github'
  org: string
  repo: string
  branch: string
  filepath: string
  eltPath?: string
  getRepoPath(): string
  gitpath: string
}
