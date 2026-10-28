import {webcrypto} from 'node:crypto'
import {handleRoute} from '../routes/routes'
import {isModelKey} from '../export/exportSlots'
import {MODEL_KEY_MAX_LENGTH} from '../export/exportSlots'
import {modelSlotKey, urlModelKey} from './modelSlotKey'
import {directLinkQuotaKey} from './useDirectLinkQuota'


// jsdom has no SubtleCrypto; Node's is the same Web Crypto API the browser
// gives a secure context.
const SUBTLE = webcrypto.subtle

// A presigned S3 URL of the length real ones run to: the signature and the
// session token are credentials.
const TOKEN_REPEATS = 80
const SECRET_TOKEN = 'IQoJb3JpZ2luX2VjEJr'.repeat(TOKEN_REPEATS)
const TOKEN_PREFIX = SECRET_TOKEN.slice(0, SECRET_TOKEN.length / TOKEN_REPEATS)
const PRESIGNED = 'https://bucket.s3.us-east-1.amazonaws.com/models/tower.ifc' +
  '?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAEXAMPLE%2F20261027%2Fus-east-1%2Fs3%2Faws4_request' +
  `&X-Amz-Date=20261027T120000Z&X-Amz-Expires=3600&X-Amz-Security-Token=${SECRET_TOKEN}` +
  '&X-Amz-SignedHeaders=host&X-Amz-Signature=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'


describe('quota/modelSlotKey', () => {
  it('keys a local file by its /v/local-only/ path, the one record() is given on open', async () => {
    const route = handleRoute('/share/v/local-only', {'*': '0b9f4c2e-7d1a-4c55-9f0e-3a1b2c3d4e5f.ifc/12/34'})
    const key = await modelSlotKey(route, '/share', SUBTLE)
    expect(key).toBe('/share/v/local-only/0b9f4c2e-7d1a-4c55-9f0e-3a1b2c3d4e5f.ifc')
    expect(isModelKey(key)).toBe(true)
  })

  it('keeps an install prefix on a local file', async () => {
    const route = handleRoute('/Share/share/v/local-only', {'*': 'abc.ifc'})
    expect(await modelSlotKey(route, '/Share/share', SUBTLE)).toBe('/Share/share/v/local-only/abc.ifc')
  })

  // Open and export must agree, or an opened private model takes a second
  // slot on export: the key is the open's own function's.
  it('keys a GitHub model exactly as its open records it, without the element path', async () => {
    const params = {'*': 'dir/model.ifc/1/2', 'org': 'o', 'repo': 'r', 'branch': 'main'}
    const route = handleRoute('/share/v/gh', params)
    expect(await modelSlotKey(route, '/share', SUBTLE)).toBe('/share/v/gh/o/r/main/dir/model.ifc')
    expect(await modelSlotKey(route, '/share', SUBTLE)).toBe(directLinkQuotaKey(route, '/share').key)
  })

  it('keys a Drive file exactly as its open records it, whichever route opened it', async () => {
    const byId = handleRoute('/share/v/g', {'*': '1AbCdEfGhIjKlMnOpQrStUvWxYz0123'})
    const byUrl = handleRoute('/share/v/u', {'*': 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123/view'})
    expect(await modelSlotKey(byId, '/share', SUBTLE)).toBe('/share/v/g/1AbCdEfGhIjKlMnOpQrStUvWxYz0123')
    expect(await modelSlotKey(byUrl, '/share', SUBTLE)).toBe(directLinkQuotaKey(byId, '/share').key)
  })

  it('keys a hosted file under /v/p/', async () => {
    const route = handleRoute('/share/v/p', {'*': 'index.ifc/5'})
    expect(await modelSlotKey(route, '/share', SUBTLE)).toBe('/share/v/p/index.ifc')
  })

  it('falls back to /share before the app prefix is known, and gives null with nothing loaded', async () => {
    expect(await modelSlotKey(handleRoute('/share/v/p', {'*': 'index.ifc'}), null, SUBTLE)).toBe('/share/v/p/index.ifc')
    expect(await modelSlotKey(null, '/share', SUBTLE)).toBeNull()
  })

  describe('a model opened from a URL (/v/u/)', () => {
    const route = (url) => handleRoute('/share/v/u', {'*': url})

    it('keys even a long presigned URL by a short digest the server accepts', async () => {
      expect(PRESIGNED.length).toBeGreaterThan(MODEL_KEY_MAX_LENGTH)
      const key = await modelSlotKey(route(PRESIGNED), '/share', SUBTLE)
      expect(key).toMatch(/^\/share\/v\/u\/sha256-[0-9a-f]{64}$/)
      expect(isModelKey(key)).toBe(true)
    })

    it('stores no part of the URL: no query string, no credentials, no host', async () => {
      const key = await modelSlotKey(route(PRESIGNED), '/share', SUBTLE)
      for (const leak of ['?', 'X-Amz', TOKEN_PREFIX, 'AKIAEXAMPLE', 'amazonaws', 'tower.ifc']) {
        expect(key).not.toContain(leak)
      }
    })

    it('is the same key every time for one URL, and another for another', async () => {
      const first = await modelSlotKey(route(PRESIGNED), '/share', SUBTLE)
      expect(await urlModelKey(PRESIGNED, '/share', SUBTLE)).toBe(first)
      // The fragment never reaches the server, so it does not make a model.
      expect(await urlModelKey(`${PRESIGNED}#frag`, '/share', SUBTLE)).toBe(first)
      // The query can tell two files apart, so it does.
      expect(await urlModelKey('https://example.com/get?id=1', '/share', SUBTLE))
        .not.toBe(await urlModelKey('https://example.com/get?id=2', '/share', SUBTLE))
    })

    it('says so, rather than falling back to the URL, without SubtleCrypto', async () => {
      await expect(urlModelKey(PRESIGNED, '/share', undefined)).rejects.toThrow(/SubtleCrypto/)
    })
  })
})
