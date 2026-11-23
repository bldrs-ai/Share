import {LEGACY_KEY_NAME, forgetLegacyKey} from './legacyKey'


describe('Bot/legacyKey', () => {
  it('deletes the old chat\'s plaintext key, and leaves other keys alone', () => {
    localStorage.setItem(LEGACY_KEY_NAME, 'sk-or-old')
    localStorage.setItem('unrelated', 'kept')
    forgetLegacyKey()
    expect(localStorage.getItem(LEGACY_KEY_NAME)).toBeNull()
    expect(localStorage.getItem('unrelated')).toBe('kept')
    localStorage.clear()
  })
})
