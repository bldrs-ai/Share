import { assert } from './assert'


test('assert', () => {
  assert(true, 'Should validate');
  let failed = false;
  try {
    assert(false, 'Should fail');
  } catch (e) {
    // Expected.
    failed = true;
  }
  if (!failed) {
    throw new Error('False assert test should have thrown')
  }
});
