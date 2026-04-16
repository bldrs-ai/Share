/* eslint-disable require-await, no-magic-numbers */
// Set up a Cache API polyfill before importing the module under test so
// that `httpCacheApiAvailable` (computed at import time) is true and the
// interesting code path is exercised.

/**
 * Minimal Cache API stand-in backed by a Map.
 */
class MockCache {
  /** */
  constructor() {
    this.store = new Map()
  }

  /**
   * @param {string} key
   * @return {Response|undefined}
   */
  async match(key) {
    return this.store.get(key)
  }

  /**
   * @param {string} key
   * @param {Response} response
   */
  async put(key, response) {
    this.store.set(key, response)
  }

  /**
   * @param {string} key
   * @return {boolean}
   */
  async delete(key) {
    return this.store.delete(key)
  }
}


const mockCache = new MockCache()
global.caches = {
  open: jest.fn(async () => mockCache),
}


const {
  checkCache,
  checkCacheRaw,
  convertToOctokitResponse,
  deleteCache,
  getCache,
  updateCache,
  updateCacheRaw,
} = require('./Cache')


describe('net/github/Cache', () => {
  beforeEach(() => {
    mockCache.store.clear()
  })


  describe('getCache', () => {
    it('opens the bldrs-github-api-cache once and memoizes it', async () => {
      const a = await getCache()
      const b = await getCache()
      expect(a).toBe(b)
      // `open` may have been called by other tests in the file due to
      // module-level memoization, so just assert it was called with the
      // expected cache name at least once.
      expect(global.caches.open).toHaveBeenCalledWith('bldrs-github-api-cache')
    })
  })


  describe('convertToOctokitResponse', () => {
    it('returns null when given null', async () => {
      expect(await convertToOctokitResponse(null)).toBeNull()
    })

    it('unpacks a Response into an Octokit-style object', async () => {
      const body = JSON.stringify({hello: 'world'})
      const wrapped = new Response(body, {
        status: 200,
        headers: {'content-type': 'application/json', 'etag': 'W/"abc"'},
      })
      const octokit = await convertToOctokitResponse(wrapped)
      expect(octokit.status).toBe(200)
      expect(octokit.data).toEqual({hello: 'world'})
      expect(octokit.headers['etag']).toBe('W/"abc"')
      expect(octokit.headers['content-type']).toMatch(/application\/json/)
    })
  })


  describe('checkCache', () => {
    it('returns null on a miss', async () => {
      expect(await checkCache('missing-key')).toBeNull()
    })

    it('returns the Octokit-shaped value after updateCache', async () => {
      const response = {
        data: {name: 'Share'},
        headers: {etag: 'W/"etag-1"'},
      }
      await updateCache('repo-key', response)

      const cached = await checkCache('repo-key')
      expect(cached).not.toBeNull()
      expect(cached.data).toEqual({name: 'Share'})
      expect(cached.headers.etag).toBe('W/"etag-1"')
    })

    it('returns null on an internal error (match throws)', async () => {
      // Replace the memoized cache's `match` with one that throws.
      const original = mockCache.match.bind(mockCache)
      mockCache.match = async () => {
        throw new Error('boom')
      }
      try {
        expect(await checkCache('anything')).toBeNull()
      } finally {
        mockCache.match = original
      }
    })
  })


  describe('updateCache', () => {
    it('is a no-op when the response has no etag', async () => {
      await updateCache('no-etag-key', {data: {a: 1}, headers: {}})
      expect(await checkCache('no-etag-key')).toBeNull()
    })

    it('stores a Response whose body is the JSON-serialized data', async () => {
      await updateCache('with-etag', {
        data: {count: 42},
        headers: {etag: 'W/"e"'},
      })

      const raw = await checkCacheRaw('with-etag')
      expect(raw).toBeInstanceOf(Response)
      const parsed = await raw.json()
      expect(parsed).toEqual({count: 42})
    })
  })


  describe('updateCacheRaw', () => {
    it('preserves the CommitHash and LastModifiedGithub custom headers', async () => {
      const incoming = new Response('file-bytes', {
        status: 200,
        statusText: 'OK',
        headers: {'content-type': 'application/octet-stream'},
      })

      await updateCacheRaw('raw-key', incoming, 'deadbeef', 1700000000000)

      const cached = await checkCacheRaw('raw-key')
      expect(cached).toBeInstanceOf(Response)
      expect(cached.status).toBe(200)
      expect(cached.headers.get('CommitHash')).toBe('deadbeef')
      expect(cached.headers.get('LastModifiedGithub')).toBe('1700000000000')
      expect(cached.headers.get('content-type')).toBe('application/octet-stream')
    })

    it('skips the LastModifiedGithub header when not provided', async () => {
      const incoming = new Response('body', {status: 200, headers: {}})

      await updateCacheRaw('raw-key-2', incoming, 'hash-only')

      const cached = await checkCacheRaw('raw-key-2')
      expect(cached.headers.get('CommitHash')).toBe('hash-only')
      expect(cached.headers.get('LastModifiedGithub')).toBeNull()
    })
  })


  describe('checkCacheRaw', () => {
    it('returns undefined for a missing key', async () => {
      // Map.get returns undefined, which propagates through checkCacheRaw.
      expect(await checkCacheRaw('nope')).toBeUndefined()
    })
  })


  describe('deleteCache', () => {
    it('removes an existing entry', async () => {
      await updateCacheRaw('to-delete', new Response('x'), 'hash')
      expect(await checkCacheRaw('to-delete')).toBeInstanceOf(Response)

      await deleteCache('to-delete')
      expect(await checkCacheRaw('to-delete')).toBeUndefined()
    })

    it('is tolerant when the entry does not exist', async () => {
      // deleteCache logs on failure but should not throw.
      await expect(deleteCache('never-existed')).resolves.toBeUndefined()
    })
  })
})
