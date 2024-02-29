import {
  assert,
  assertDefined,
  assertArraysEqualLength,
} from './assert'


test('assert', () => {
  assert(true, 'Should validate')
  try {
    assert(false, 'Should fail')
    throw new Error('False assert test should have thrown')
  } catch (e) {
    // Expected
  }
})


test('assertDefined', () => {
  assertDefined(1)
  assertDefined(1, 2)
  assertDefined(1, 2, 3)
  assertDefined([])
  assertDefined([], [])
  assertDefined([], [], [])
  expectFailure(() => {
    assertDefined([undefined])
  })
  expectFailure(() => {
    assertDefined([1], [undefined])
  })
  expectFailure(() => {
    assertDefined([undefined], [1])
  })
  expectFailure(() => {
    assertDefined([undefined], [1])
  })
  expectFailure(() => {
    assertDefined([undefined], [undefined])
  })
  expectFailure(() => {
    assertDefined(undefined)
  })
  expectFailure(() => {
    assertDefined(undefined, 1)
  })
  expectFailure(() => {
    assertDefined(1, undefined)
  })
  const a = undefined
  const b = 1
  expectFailure(() => {
    new TestArgsCtor(a, b)
  })
  expectFailure(() => {
    new TestVarargs(a, b)
  })
})


test('assertArraysEqualLength', () => {
  expectFailure(() => {
    assertArraysEqualLength()
  })
  expectFailure(() => {
    assertArraysEqualLength([])
  })
  assertArraysEqualLength([], [])
  assertArraysEqualLength([], [], [])
  assertArraysEqualLength([], [], [], [])

  assertArraysEqualLength([1, 1, 1], [2, 2, 2])
  assertArraysEqualLength([1, 1, 1], [2, 2, 2], [3, 3, 3])
})


/**
 * Catches expected failures or throws if no failure.
 *
 * @param {Function} assertCb The function to call which should fail.
 */
function expectFailure(assertCb) {
  try {
    assertCb()
    throw new Error('Assert should have failed')
  } catch {
    // Expected
  }
}

/** Dummy class which asserts is ctor args. */
class TestArgsCtor {
  /**
   * @param {any} a test arg, possibly undefined
   * @param {any} b test arg, possibly undefined
   */
  constructor(a, b) {
    assertDefined(a, b)
  }
}


/** Dummy class which asserts is ctor args. */
class TestVarargs {
  /**
   * @param {any} a test arg, possibly undefined
   * @param {any} b test arg, possibly undefined
   */
  constructor(a, b) {
    assertDefined(...arguments)
  }
}
