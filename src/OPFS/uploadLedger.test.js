import {loadRecentFilesBySource} from '../connections/persistence'
import {
  UPLOAD_LEDGER_KEY,
  UPLOAD_LEDGER_MAX,
  hasSeenLocalUpload,
  recordLocalUpload,
  seedUploadLedgerFromRecents,
} from './uploadLedger'


jest.mock('../connections/persistence', () => ({loadRecentFilesBySource: jest.fn()}))


const ID = '12345678-1234-4abc-9def-123456789abc.ifc'


describe('OPFS/uploadLedger', () => {
  beforeEach(() => {
    localStorage.clear()
    jest.restoreAllMocks()
    loadRecentFilesBySource.mockReset()
  })

  it('round-trips a recorded id and knows nothing else', () => {
    expect(hasSeenLocalUpload(ID)).toBe(false)
    recordLocalUpload(ID)
    expect(hasSeenLocalUpload(ID)).toBe(true)
    expect(hasSeenLocalUpload('other.ifc')).toBe(false)
  })

  it('is idempotent and ignores non-string or empty ids', () => {
    recordLocalUpload(ID)
    recordLocalUpload(ID)
    recordLocalUpload('')
    recordLocalUpload(undefined)
    recordLocalUpload({id: ID})
    expect(JSON.parse(localStorage.getItem(UPLOAD_LEDGER_KEY))).toEqual([ID])
    expect(hasSeenLocalUpload(undefined)).toBe(false)
  })

  it('caps at the maximum, dropping the oldest', () => {
    for (let i = 0; i < UPLOAD_LEDGER_MAX + 3; i++) {
      recordLocalUpload(`id-${i}.ifc`)
    }
    const ledger = JSON.parse(localStorage.getItem(UPLOAD_LEDGER_KEY))
    expect(ledger).toHaveLength(UPLOAD_LEDGER_MAX)
    expect(hasSeenLocalUpload('id-0.ifc')).toBe(false)
    expect(hasSeenLocalUpload('id-2.ifc')).toBe(false)
    expect(hasSeenLocalUpload('id-3.ifc')).toBe(true)
    expect(ledger[ledger.length - 1]).toBe(`id-${UPLOAD_LEDGER_MAX + 2}.ifc`)
  })

  it('treats corrupt storage as empty and recovers on the next write', () => {
    localStorage.setItem(UPLOAD_LEDGER_KEY, '{not json')
    expect(hasSeenLocalUpload(ID)).toBe(false)
    recordLocalUpload(ID)
    expect(hasSeenLocalUpload(ID)).toBe(true)
    localStorage.setItem(UPLOAD_LEDGER_KEY, '{"a":1}')
    expect(hasSeenLocalUpload(ID)).toBe(false)
  })

  it('never throws when localStorage does', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    expect(() => recordLocalUpload(ID)).not.toThrow()
    expect(hasSeenLocalUpload(ID)).toBe(false)
    expect(() => seedUploadLedgerFromRecents()).not.toThrow()
  })

  it('seeds from local recents, keeping what was already recorded', () => {
    recordLocalUpload('first.ifc')
    loadRecentFilesBySource.mockReturnValue([{id: ID}, {id: 'first.ifc'}])
    seedUploadLedgerFromRecents()
    expect(loadRecentFilesBySource).toHaveBeenCalledWith('local')
    expect(JSON.parse(localStorage.getItem(UPLOAD_LEDGER_KEY))).toEqual(['first.ifc', ID])
  })
})
