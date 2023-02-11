import * as Privacy from '../../privacy/Privacy'
import {setPrivacy} from './PrivacyControl'


describe('PrivacyControl tests', () => {
  test('sets privacy settings correctly', () => {
    // Test setting privacy to disabled
    setPrivacy(true)
    expect(Privacy.isPrivacySocialEnabled()).toBe(false)
    // Test setting privacy to enabled
    setPrivacy(false)
    expect(Privacy.isPrivacySocialEnabled()).toBe(true)
  })
})
