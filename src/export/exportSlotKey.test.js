import {handleRoute} from '../routes/routes'
import {isModelKey} from './exportSlots'
import {exportSlotKey} from './exportSlotKey'
import {directLinkQuotaKey} from '../quota/useDirectLinkQuota'


describe('export/exportSlotKey', () => {
  it('keys a local file by its /v/local-only/ path, the one record() is given on open', () => {
    const route = handleRoute('/share/v/local-only', {'*': '0b9f4c2e-7d1a-4c55-9f0e-3a1b2c3d4e5f.ifc/12/34'})
    const key = exportSlotKey(route, '/share')
    expect(key).toBe('/share/v/local-only/0b9f4c2e-7d1a-4c55-9f0e-3a1b2c3d4e5f.ifc')
    expect(isModelKey(key)).toBe(true)
  })

  it('keeps an install prefix on a local file', () => {
    const route = handleRoute('/Share/share/v/local-only', {'*': 'abc.ifc'})
    expect(exportSlotKey(route, '/Share/share')).toBe('/Share/share/v/local-only/abc.ifc')
  })

  it('keys a GitHub model exactly as a private open of it is recorded, without the element path', () => {
    const params = {'*': 'dir/model.ifc/1/2', 'org': 'o', 'repo': 'r', 'branch': 'main'}
    const route = handleRoute('/share/v/gh', params)
    expect(exportSlotKey(route, '/share')).toBe('/share/v/gh/o/r/main/dir/model.ifc')
    expect(exportSlotKey(route, '/share')).toBe(directLinkQuotaKey(route, '/share').key)
  })

  it('keys a Drive file by its file id, as the Open dialog records it', () => {
    const route = handleRoute('/share/v/g', {'*': '1AbCdEfGhIjKlMnOpQrStUvWxYz0123'})
    expect(exportSlotKey(route, '/share')).toBe('/share/v/g/1AbCdEfGhIjKlMnOpQrStUvWxYz0123')
  })

  it('keys a hosted file under /v/p/', () => {
    const route = handleRoute('/share/v/p', {'*': 'index.ifc/5'})
    expect(exportSlotKey(route, '/share')).toBe('/share/v/p/index.ifc')
  })

  it('falls back to /share before the app prefix is known, and gives null with nothing loaded', () => {
    expect(exportSlotKey(handleRoute('/share/v/p', {'*': 'index.ifc'}), null)).toBe('/share/v/p/index.ifc')
    expect(exportSlotKey(null, '/share')).toBeNull()
  })
})
