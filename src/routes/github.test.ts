import processGitHubFile, {processGithubUrl, githubUrlToSharePath} from './github'


describe('processGitHubFile', () => {
  const org = 'test-org'
  const repo = 'test-repo'
  const branch = 'test-branch'
  const filepath = `path/to/file.ifc`
  const eltPath = '1/2/3'

  it('org, repo, branch and filepath', () => {
    const originalUrl = new URL(`http://bldrs.ai/share/v/gh/${org}/${repo}/${branch}/${filepath}`)
    const urlParams = {
      'org': org,
      'repo': repo,
      'branch': branch,
      '*': filepath,
    }
    const result = processGitHubFile(originalUrl, filepath, urlParams)
    const downloadUrl = new URL(`https://github.com/${org}/${repo}/${branch}/${filepath}`)
    expect(result).toEqual({
      originalUrl,
      downloadUrl,
      kind: 'provider',
      provider: 'github',
      org,
      repo,
      branch,
      filepath,
      getRepoPath: expect.any(Function),
      gitpath: downloadUrl.toString(),
    })
  })


  it('org, repo, branch and filepath with elts', () => {
    const filepathWithElts = `${filepath}/${eltPath}`
    const originalUrl = new URL(`http://bldrs.ai/share/v/gh/${org}/${repo}/${branch}/${filepathWithElts}`)
    const urlParams = {
      'org': org,
      'repo': repo,
      'branch': branch,
      '*': filepathWithElts,
    }
    const result = processGitHubFile(originalUrl, filepathWithElts, urlParams)
    const downloadUrl = new URL(`https://github.com/${org}/${repo}/${branch}/${filepath}`)
    expect(result).toEqual({
      originalUrl,
      downloadUrl,
      kind: 'provider',
      provider: 'github',
      org,
      repo,
      branch,
      filepath,
      eltPath,
      getRepoPath: expect.any(Function),
      gitpath: downloadUrl.toString(),
    })
  })

  it('org, repo and various branch names', () => {
    const branches = ['main', 'develop', 'feature/new-feature', 'v1.0.0']
    branches.forEach((branchName) => {
      const originalUrl = new URL(`http://bldrs.ai/share/v/gh/${org}/${repo}/${branchName}/${filepath}`)
      const urlParams = {
        'org': org,
        'repo': repo,
        'branch': branchName,
        '*': filepath,
      }
      const result = processGitHubFile(originalUrl, filepath, urlParams)
      const downloadUrl = new URL(`https://github.com/${org}/${repo}/${branchName}/${filepath}`)
      expect(result).toEqual({
        originalUrl,
        downloadUrl,
        kind: 'provider',
        provider: 'github',
        org,
        repo,
        branch: branchName,
        filepath,
        getRepoPath: expect.any(Function),
        gitpath: downloadUrl.toString(),
      })
    })
  })
})


describe('processGithubUrl', () => {
  const originalUrl = new URL('http://bldrs.ai/share/v/gh/test-org/test-repo/main/model.ifc')

  it('processes valid GitHub URL with blob path', () => {
    const githubUrl = new URL('https://github.com/test-org/test-repo/blob/main/path/to/model.ifc')
    const result = processGithubUrl(originalUrl, githubUrl)

    expect(result).toEqual({
      originalUrl,
      downloadUrl: new URL('https://github.com/test-org/test-repo/main/path/to/model.ifc'),
      kind: 'provider',
      provider: 'github',
      org: 'test-org',
      repo: 'test-repo',
      branch: 'main',
      filepath: 'path/to/model.ifc',
      getRepoPath: expect.any(Function),
      gitpath: 'https://github.com/test-org/test-repo/main/path/to/model.ifc',
    })
  })

  it('processes valid GitHub URL with raw path', () => {
    const githubUrl = new URL('https://raw.githubusercontent.com/test-org/test-repo/main/path/to/model.ifc')
    const result = processGithubUrl(originalUrl, githubUrl)

    expect(result).toEqual({
      originalUrl,
      downloadUrl: new URL('https://github.com/test-org/test-repo/main/path/to/model.ifc'),
      kind: 'provider',
      provider: 'github',
      org: 'test-org',
      repo: 'test-repo',
      branch: 'main',
      filepath: 'path/to/model.ifc',
      getRepoPath: expect.any(Function),
      gitpath: 'https://github.com/test-org/test-repo/main/path/to/model.ifc',
    })
  })

  it('processes GitHub URL with element path', () => {
    const githubUrl = new URL('https://github.com/test-org/test-repo/blob/main/path/to/model.ifc/1/2/3')
    const result = processGithubUrl(originalUrl, githubUrl)

    expect(result).toEqual({
      originalUrl,
      downloadUrl: new URL('https://github.com/test-org/test-repo/main/path/to/model.ifc'),
      kind: 'provider',
      provider: 'github',
      org: 'test-org',
      repo: 'test-repo',
      branch: 'main',
      filepath: 'path/to/model.ifc',
      eltPath: '1/2/3',
      getRepoPath: expect.any(Function),
      gitpath: 'https://github.com/test-org/test-repo/main/path/to/model.ifc',
    })
  })

  it('returns null for non-GitHub URL', () => {
    const nonGithubUrl = new URL('https://drive.google.com/file/d/123/view')
    const result = processGithubUrl(originalUrl, nonGithubUrl)

    expect(result).toBeNull()
  })

  it('returns null for invalid GitHub URL format', () => {
    const invalidGithubUrl = new URL('https://github.com/invalid-format')
    const result = processGithubUrl(originalUrl, invalidGithubUrl)

    expect(result).toBeNull()
  })
})


describe('githubUrlToSharePath', () => {
  it('converts valid GitHub URL to share path', () => {
    const githubUrl = 'https://github.com/test-org/test-repo/blob/main/path/to/model.ifc'
    const result = githubUrlToSharePath(githubUrl)

    expect(result).toBe('/share/v/gh/test-org/test-repo/main/path/to/model.ifc')
  })

  it('converts raw GitHub URL to share path', () => {
    const githubUrl = 'https://raw.githubusercontent.com/test-org/test-repo/main/path/to/model.ifc'
    const result = githubUrlToSharePath(githubUrl)

    expect(result).toBe('/share/v/gh/test-org/test-repo/main/path/to/model.ifc')
  })

  it('returns null for non-GitHub URL', () => {
    const nonGithubUrl = 'https://drive.google.com/file/d/123/view'
    const result = githubUrlToSharePath(nonGithubUrl)

    expect(result).toBeNull()
  })

  it('returns null for invalid GitHub URL format', () => {
    const invalidGithubUrl = 'https://github.com/invalid-format'
    const result = githubUrlToSharePath(invalidGithubUrl)

    expect(result).toBeNull()
  })
})
