import 'jest'


declare global {
  // We’re augmenting the runtime global with a var named `context` like cypress.
  // eslint-disable-next-line no-var
  var context: jest.Describe
}

export {}
