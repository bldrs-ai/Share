import type {ProviderResult} from './routes'


/**
 * Processes a GitHub file path for remote repository files.
 *
 * @param filepath - The file path within the repository
 * @param eltPath - Optional element path
 * @param routeParams - URL parameters containing org, repo, branch
 * @return Route object
 */
export default function processGitHubFile(
  filepath: string,
  eltPath: string | undefined,
  routeParams: {org: string, repo: string, branch: string},
): GithubResult {
  const org = routeParams['org']
  const repo = routeParams['repo']
  const branch = routeParams['branch']
  const result: GithubResult = {
    get sourceUrl() {
      return new URL(`https://github.com/${this.getRepoPath()}`)
    },
    kind: 'provider',
    provider: 'github',
    org,
    repo,
    branch,
    filepath,
    eltPath: eltPath || null,
    getRepoPath: () => `/${org}/${repo}/${branch}${filepath}`,
    // TODO(pablo): remove this
    get gitpath() {
      return `https://github.com${this.getRepoPath()}`
    },
  }
  return result
}

// Types
export interface GithubResult extends ProviderResult {
  provider: 'github'
  org: string
  repo: string
  branch: string
  filepath: string
  eltPath: string | null
  getRepoPath(): string
  get gitpath(): string
}
