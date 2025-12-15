import processGitHubFile from './github'


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
