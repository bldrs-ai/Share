import {
  getGitHubResource,
  getGitHub,
  getGitHubNoCache,
  postGitHub,
  deleteGitHub,
  patchGitHub,
} from './Http'

// Mock dependencies
jest.mock('../../utils/assert', () => ({
  assertDefined: jest.fn(),
}))

jest.mock('./Cache', () => ({
  checkCache: jest.fn(),
  updateCache: jest.fn(),
}))

jest.mock('./OctokitExport', () => ({
  octokit: {
    request: jest.fn(),
  },
}))

// Import the mocked functions for easy access in tests
import {checkCache, updateCache} from './Cache'
import {octokit} from './OctokitExport'


describe('Http.js functions', () => {
  const repository = {orgName: 'testOrg', name: 'testRepo'}
  const testPath = 'contents/{path}?ref={ref}'
  const args = {path: 'file.txt', ref: 'main'}
  const accessToken = 'test-token'

  beforeEach(() => {
    jest.resetAllMocks()
  })

  describe('getGitHubResource', () => {
    it('should successfully fetch resource without cache', async () => {
      const responseMock = {data: 'response data'}
      octokit.request.mockResolvedValue(responseMock)

      const result = await getGitHubResource(repository, testPath, args, false, '')

      expect(result.response).toBe(responseMock)
      expect(result.isCacheHit).toBe(false)
      // Verify that the request was called with the correct URL and params
      expect(octokit.request).toHaveBeenCalledWith(
        expect.stringContaining(`GET /repos/{org}/{repo}/${testPath}`),
        expect.objectContaining({
          org: repository.orgName,
          repo: repository.name,
          ...args,
        }),
      )
    })

    it('should include authorization header when accessToken is provided', async () => {
      const responseMock = {data: 'response data'}
      octokit.request.mockResolvedValue(responseMock)

      await getGitHubResource(repository, testPath, args, false, accessToken)
      // Check that headers include the Bearer token
      expect(octokit.request.mock.calls[0][1].headers.authorization).toBe(`Bearer ${accessToken}`)
    })

    it('should check cache and include If-None-Match header if etag exists', async () => {
      const cachedMock = {data: 'cached data', headers: {etag: '12345'}}
      checkCache.mockResolvedValue(cachedMock)
      const responseMock = {data: 'fresh data', headers: {etag: '67890'}}
      octokit.request.mockResolvedValue(responseMock)

      const result = await getGitHubResource(repository, testPath, args, true, '')

      expect(checkCache).toHaveBeenCalledWith(`${repository.orgName}/${repository.name}/${testPath}`)
      expect(octokit.request.mock.calls[0][1].headers['If-None-Match']).toBe('12345')
      expect(updateCache).toHaveBeenCalledWith(`${repository.orgName}/${repository.name}/${testPath}`, responseMock)
      expect(result.response).toBe(responseMock)
      expect(result.isCacheHit).toBe(false)
    })

    it('should return cached response on 304 error when cache exists', async () => {
      const cachedMock = {data: 'cached data', headers: {etag: '12345'}}
      checkCache.mockResolvedValue(cachedMock)
      const error304 = new Error('Not Modified')
      error304.status = 304
      octokit.request.mockRejectedValue(error304)

      const result = await getGitHubResource(repository, testPath, args, true, '')
      expect(result.response).toBe(cachedMock)
      expect(result.isCacheHit).toBe(true)
    })

    it('should rethrow error when non-304 error occurs', async () => {
      checkCache.mockResolvedValue(null)
      const error500 = new Error('Server Error')
      error500.status = 500
      octokit.request.mockRejectedValue(error500)

      await expect(getGitHubResource(repository, testPath, args, true, '')).rejects.toThrow('Server Error')
    })
  })

  describe('getGitHub', () => {
    it('should successfully fetch resource and update cache', async () => {
      checkCache.mockResolvedValue(null)
      const responseMock = {data: 'response data', headers: {etag: 'etag-new'}}
      octokit.request.mockResolvedValue(responseMock)

      const result = await getGitHub(repository, testPath, args, '')
      expect(result).toBe(responseMock)
      expect(updateCache).toHaveBeenCalledWith(`${repository.orgName}/${repository.name}/${testPath}`, responseMock)
    })

    it('should use cached response on 304 error', async () => {
      const cachedMock = {data: 'cached data', headers: {etag: 'etag-cached'}}
      checkCache.mockResolvedValue(cachedMock)
      const error304 = new Error('Not Modified')
      error304.status = 304
      octokit.request.mockRejectedValue(error304)

      const result = await getGitHub(repository, testPath, args, '')
      expect(result).toBe(cachedMock)
    })

    it('should rethrow error for non-304 errors', async () => {
      checkCache.mockResolvedValue(null)
      const error500 = new Error('Server Error')
      error500.status = 500
      octokit.request.mockRejectedValue(error500)

      await expect(getGitHub(repository, testPath, args, '')).rejects.toThrow('Server Error')
    })
  })

  describe('getGitHubNoCache', () => {
    const simplePath = 'contents/file.txt'
    it('should fetch resource without using cache', async () => {
      const responseMock = {data: 'no cache response'}
      octokit.request.mockResolvedValue(responseMock)

      const result = await getGitHubNoCache(repository, simplePath, args, '')
      expect(result).toBe(responseMock)
      // Ensure caching functions are not called
      expect(checkCache).not.toHaveBeenCalled()
      expect(updateCache).not.toHaveBeenCalled()
    })

    it('should timeout if request does not complete', async () => {
      // Simulate a never-resolving request
      jest.useFakeTimers()
      // eslint-disable-next-line no-empty-function
      octokit.request.mockImplementation(() => new Promise(() => {}))

      const promise = getGitHubNoCache(repository, simplePath, args, '')
      // eslint-disable-next-line no-magic-numbers
      jest.advanceTimersByTime(10000)

      await expect(promise).rejects.toThrow('Request timed out')
      jest.useRealTimers()
    })
  })

  describe('postGitHub', () => {
    const postPath = 'some/path'
    const postArgs = {data: {key: 'value'}}
    it('should post resource with correct headers', async () => {
      const responseMock = {data: 'post response'}
      octokit.request.mockResolvedValue(responseMock)

      const result = await postGitHub(repository, postPath, postArgs, accessToken)
      expect(result).toBe(responseMock)
      expect(octokit.request).toHaveBeenCalledWith(
        expect.stringContaining(`POST /repos/{org}/{repo}/${postPath}`),
        expect.objectContaining({
          org: repository.orgName,
          repo: repository.name,
          data: {key: 'value'},
          headers: expect.objectContaining({
            authorization: `Bearer ${accessToken}`,
          }),
        }),
      )
    })
  })

  describe('deleteGitHub', () => {
    const delPath = 'some/path'
    it('should delete resource with correct headers', async () => {
      const responseMock = {data: 'delete response'}
      octokit.request.mockResolvedValue(responseMock)

      const result = await deleteGitHub(repository, delPath, {}, accessToken)
      expect(result).toBe(responseMock)
      expect(octokit.request).toHaveBeenCalledWith(
        expect.stringContaining(`DELETE /repos/{org}/{repo}/${delPath}`),
        expect.objectContaining({
          org: repository.orgName,
          repo: repository.name,
          headers: expect.objectContaining({
            authorization: `Bearer ${accessToken}`,
          }),
        }),
      )
    })
  })

  describe('patchGitHub', () => {
    const patchPath = 'some/path'
    const patchArgs = {data: {update: true}}
    it('should patch resource with correct headers and URL format', async () => {
      const responseMock = {data: 'patch response'}
      octokit.request.mockResolvedValue(responseMock)

      const result = await patchGitHub(repository, patchPath, patchArgs, accessToken)
      expect(result).toBe(responseMock)
      expect(octokit.request).toHaveBeenCalledWith(
        expect.stringContaining(`PATCH /repos/${repository.orgName}/${repository.name}/${patchPath}`),
        expect.objectContaining({
          org: repository.orgName,
          repo: repository.name,
          data: {update: true},
          headers: expect.objectContaining({
            authorization: `Bearer ${accessToken}`,
          }),
        }),
      )
    })
  })
})
