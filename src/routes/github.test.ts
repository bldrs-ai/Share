import processGitHubFile from './github'


describe('processGitHubFile', () => {
  it('should process GitHub file paths correctly', () => {
    const urlParams = {
      org: 'test-org',
      repo: 'test-repo',
      branch: 'main',
    }
    const result = processGitHubFile('/path/to/file.ifc', 'element/path', urlParams)

    expect(result).toEqual({
      org: 'test-org',
      repo: 'test-repo',
      branch: 'main',
      filepath: '/path/to/file.ifc',
      eltPath: 'element/path',
      getRepoPath: expect.any(Function),
      gitpath: 'https://github.com/test-org/test-repo/main/path/to/file.ifc',
    })
  })

  it('should handle GitHub files without element path', () => {
    const urlParams = {
      org: 'test-org',
      repo: 'test-repo',
      branch: 'develop',
    }
    const result = processGitHubFile('/path/to/file.ifc', null, urlParams)

    expect(result).toEqual({
      org: 'test-org',
      repo: 'test-repo',
      branch: 'develop',
      filepath: '/path/to/file.ifc',
      eltPath: null,
      getRepoPath: expect.any(Function),
      gitpath: 'https://github.com/test-org/test-repo/develop/path/to/file.ifc',
    })
  })

  it('should generate correct getRepoPath function', () => {
    const urlParams = {
      org: 'test-org',
      repo: 'test-repo',
      branch: 'main',
    }
    const result = processGitHubFile('/path/to/file.ifc', 'element', urlParams)

    expect(result.getRepoPath()).toBe('/test-org/test-repo/main/path/to/file.ifc')
  })

  it('should handle various branch names', () => {
    const branches = ['main', 'develop', 'feature/new-feature', 'v1.0.0']
    branches.forEach((branch) => {
      const urlParams = {
        org: 'test-org',
        repo: 'test-repo',
        branch,
      }
      const result = processGitHubFile('/file.ifc', 'element', urlParams)
      expect(result.branch).toBe(branch)
      expect(result.gitpath).toBe(`https://github.com/test-org/test-repo/${branch}/file.ifc`)
    })
  })

  it('should handle special characters in org and repo names', () => {
    const urlParams = {
      org: 'test-org-name',
      repo: 'test-repo-name',
      branch: 'main',
    }
    const result = processGitHubFile('/path/to/file.ifc', 'element', urlParams)

    expect(result.org).toBe('test-org-name')
    expect(result.repo).toBe('test-repo-name')
    expect(result.gitpath).toBe('https://github.com/test-org-name/test-repo-name/main/path/to/file.ifc')
  })
})
