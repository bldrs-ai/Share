import {splitAroundExtensionRemoveFirstSlash} from '../Filetype'
import {parseGitHubRepositoryUrl} from '../net/github/utils'
import type {ProviderResult, BaseParams} from './routes'


/**
 * Processes a GitHub file path for remote repository files.
 *
 * @param originalUrl - The original URL
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


/**
 * Processes a GitHub URL and returns the result.
 *
 * @param originalUrl - The original URL
 * @param maybeGithubUrl - The GitHub URL to process
 * @return Result or null
 */
export function processGithubUrl(originalUrl: URL, maybeGithubUrl: URL): GithubResult | null {
  try {
    const parsed = parseGitHubRepositoryUrl(maybeGithubUrl.toString())
    const {owner, repository, ref, path} = parsed as {owner: string, repository: string, ref: string, path: string}

    const {parts, extension} = splitAroundExtensionRemoveFirstSlash(path)
    const reducedFilePath = `${parts[0]}${extension}`
    const getRepoPath = () => `/${owner}/${repository}/${ref}/${reducedFilePath}`
    const downloadUrl = new URL(`https://github.com${getRepoPath()}`)

    const result: GithubResult = {
      originalUrl,
      downloadUrl,
      kind: 'provider',
      provider: 'github',
      org: owner,
      repo: repository,
      branch: ref,
      filepath: reducedFilePath,
      getRepoPath,
      gitpath: downloadUrl.toString(),
      ...(parts[1] ? {eltPath: parts[1]} : {}),
    }

    return result
  } catch {
    return null
  }
}


/**
 * Converts GitHub URL info to a share path.
 *
 * @param githubUrl - The GitHub URL string
 * @return Share path or null if not a valid GitHub URL
 */
export function githubUrlToSharePath(githubUrl: string): string | null {
  try {
    const parsed = parseGitHubRepositoryUrl(githubUrl)
    const {owner, repository, ref, path} = parsed as {owner: string, repository: string, ref: string, path: string}
    return `/share/v/gh/${owner}/${repository}/${ref}/${path}`
  } catch {
    return null
  }
}
