import {isValidUrl, processGoogleDriveUrl, processExternalUrl, processProjectFile, processGitHubFile} from './urlHelpers'


describe('urlHelpers', () => {
  describe('isValidUrl', () => {
    it('should return true for valid URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true)
      expect(isValidUrl('http://example.com')).toBe(true)
      expect(isValidUrl('https://drive.google.com/file/d/1234567890/view')).toBe(true)
      expect(isValidUrl('https://example.com/path?param=value#fragment')).toBe(true)
    })

    it('should return false for invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false)
      expect(isValidUrl('')).toBe(false)
      expect(isValidUrl('example.com')).toBe(false) // Missing protocol
      expect(isValidUrl('https://')).toBe(false) // Missing domain
      expect(isValidUrl('://example.com')).toBe(false) // Missing protocol
    })

    it('should return false for null and undefined', () => {
      expect(isValidUrl(null)).toBe(false)
      expect(isValidUrl(undefined)).toBe(false)
    })
  })

  describe('processGoogleDriveUrl', () => {
    const originalEnv = process.env

    beforeEach(() => {
      jest.resetModules()
      process.env = {...originalEnv}
      // Clear the specific environment variables we're testing
      delete process.env.CORS_PROXY_HOST
      delete process.env.CORS_PROXY_PATH
    })

    afterEach(() => {
      process.env = originalEnv
    })

    it('should process valid Google Drive URLs for production', () => {
      process.env.CORS_PROXY_HOST = null
      process.env.CORS_PROXY_PATH = '/api/cors-proxy'

      const result = processGoogleDriveUrl('https://drive.google.com/file/d/1234567890/view')
      expect(result).toBe('/api/cors-proxy?id=1234567890')
    })

    it('should process valid Google Drive URLs for development', () => {
      process.env.CORS_PROXY_HOST = 'http://localhost:3000'
      process.env.CORS_PROXY_PATH = '/api/cors-proxy'

      const result = processGoogleDriveUrl('https://drive.google.com/file/d/1234567890/view')
      expect(result).toBe('http://localhost:3000/api/cors-proxy?id=1234567890')
    })

    it('should return null for non-Google Drive URLs', () => {
      expect(processGoogleDriveUrl('https://example.com/file.pdf')).toBe(null)
      expect(processGoogleDriveUrl('https://drive.google.com/other/path')).toBe(null)
      expect(processGoogleDriveUrl('not-a-url')).toBe(null)
    })

    it('should return null for malformed Google Drive URLs', () => {
      expect(processGoogleDriveUrl('https://drive.google.com/file/d//view')).toBe(null)
      expect(processGoogleDriveUrl('https://drive.google.com/file/d/view')).toBe(null)
      expect(processGoogleDriveUrl('https://drive.google.com/file/d/')).toBe(null)
    })

    it('should handle Google Drive URLs with additional parameters', () => {
      process.env.CORS_PROXY_HOST = null
      process.env.CORS_PROXY_PATH = '/api/cors-proxy'
      const result = processGoogleDriveUrl('https://drive.google.com/file/d/1234567890/view?usp=sharing')
      expect(result).toBe('/api/cors-proxy?id=1234567890')
    })
  })

  describe('processExternalUrl', () => {
    const originalEnv = process.env

    beforeEach(() => {
      jest.resetModules()
      process.env = {...originalEnv}
      // Clear the specific environment variables we're testing
      delete process.env.CORS_PROXY_HOST
      delete process.env.CORS_PROXY_PATH
    })

    afterEach(() => {
      process.env = originalEnv
    })

    it('should return null for invalid URLs', () => {
      expect(processExternalUrl('not-a-url')).toBe(null)
      expect(processExternalUrl('')).toBe(null)
      expect(processExternalUrl(null)).toBe(null)
    })

    it('should process Google Drive URLs correctly', () => {
      process.env.CORS_PROXY_HOST = null
      process.env.CORS_PROXY_PATH = '/api/cors-proxy'

      const result = processExternalUrl('https://drive.google.com/file/d/1234567890/view')
      expect(result).toEqual({
        srcUrl: '/api/cors-proxy?id=1234567890',
        gitpath: 'external',
      })
    })

    it('should return original URL for non-Google Drive URLs', () => {
      const result = processExternalUrl('https://example.com/file.pdf')
      expect(result).toEqual({
        srcUrl: 'https://example.com/file.pdf',
        gitpath: 'external',
      })
    })

    it('should handle development environment with CORS_PROXY_HOST', () => {
      process.env.CORS_PROXY_HOST = 'http://localhost:3000'
      process.env.CORS_PROXY_PATH = '/api/cors-proxy'

      const result = processExternalUrl('https://drive.google.com/file/d/1234567890/view')
      expect(result).toEqual({
        srcUrl: 'http://localhost:3000/api/cors-proxy?id=1234567890',
        gitpath: 'external',
      })
    })

    it('should handle various valid URLs', () => {
      const urls = [
        'https://example.com/file.ifc',
        'http://localhost:8080/model.stl',
        'https://api.github.com/repos/user/repo/contents/file.obj',
      ]

      urls.forEach((url) => {
        const result = processExternalUrl(url)
        expect(result).toEqual({
          srcUrl: url,
          gitpath: 'external',
        })
      })
    })
  })

  describe('processProjectFile', () => {
    it('should process project file paths correctly', () => {
      const result = processProjectFile('/path/to/file.ifc', 'element/path')
      expect(result).toEqual({
        filepath: '/path/to/file.ifc',
        eltPath: 'element/path',
      })
    })

    it('should handle project files without element path', () => {
      const result = processProjectFile('/path/to/file.ifc', null)
      expect(result).toEqual({
        filepath: '/path/to/file.ifc',
        eltPath: null,
      })
    })

    it('should handle project files with empty element path', () => {
      const result = processProjectFile('/path/to/file.ifc', '')
      expect(result).toEqual({
        filepath: '/path/to/file.ifc',
        eltPath: '',
      })
    })

    it('should handle various file extensions', () => {
      const extensions = ['.ifc', '.stl', '.obj', '.fbx', '.step']
      extensions.forEach((ext) => {
        const result = processProjectFile(`/path/to/file${ext}`, 'element')
        expect(result).toEqual({
          filepath: `/path/to/file${ext}`,
          eltPath: 'element',
        })
      })
    })
  })

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
})
