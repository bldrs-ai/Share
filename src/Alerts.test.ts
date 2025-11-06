import {BaseError, OutOfMemoryError} from './Alerts'


describe('BaseError', () => {
  describe('toJSON', () => {
    it('serializes a basic error with all fields', () => {
      const error = new BaseError('Test message', {
        title: 'Test Title',
        description: 'Test Description',
        action: 'Test Action',
        actionUrl: '/test-url',
        severity: 'error',
      })

      const json = error.toJSON()

      expect(json).toEqual({
        name: 'BaseError',
        message: 'Test message',
        title: 'Test Title',
        description: 'Test Description',
        action: 'Test Action',
        actionUrl: '/test-url',
        severity: 'error',
        cause: undefined,
        stack: expect.any(String),
      })
    })

    it('serializes an error with default fields', () => {
      const error = new BaseError('Default message')

      const json = error.toJSON()

      expect(json).toEqual({
        name: 'BaseError',
        message: 'Default message',
        title: 'FooError',
        description: 'Default message',
        action: 'Reset',
        actionUrl: '/',
        severity: 'error',
        cause: undefined,
        stack: expect.any(String),
      })
    })

    it('serializes an error with an Error cause', () => {
      const causeError = new Error('Cause error message')
      const error = new BaseError('Test message', {
        cause: causeError,
      })

      const json = error.toJSON()

      expect(json.cause).toEqual({
        name: 'Error',
        message: 'Cause error message',
      })
      expect(json.message).toBe('Test message')
    })

    it('serializes an error with a non-Error cause', () => {
      const cause = {custom: 'cause object'}
      const error = new BaseError('Test message', {
        cause,
      })

      const json = error.toJSON()

      expect(json.cause).toBe(cause)
    })

    it('serializes a subclass error', () => {
      const error = new OutOfMemoryError('Out of memory message')

      const json = error.toJSON()

      expect(json.name).toBe('OutOfMemoryError')
      expect(json.message).toBe('Out of memory message')
      expect(json.title).toBe('Out of Memory')
      expect(json.description).toBe('Out of memory message')
      expect(json.severity).toBe('error')
    })
  })

  describe('fromJSON', () => {
    it('reconstructs an error from a JSON object with all fields', () => {
      const json = {
        name: 'BaseError',
        message: 'Test message',
        title: 'Test Title',
        description: 'Test Description',
        action: 'Test Action',
        actionUrl: '/test-url',
        severity: 'error' as const,
        stack: 'Error: Test message\n    at test.js:1:1',
      }

      const error = BaseError.fromJSON(json)

      expect(error).toBeInstanceOf(BaseError)
      expect(error.name).toBe('BaseError')
      expect(error.message).toBe('Test message')
      expect(error.title).toBe('Test Title')
      expect(error.description).toBe('Test Description')
      expect(error.action).toBe('Test Action')
      expect(error.actionUrl).toBe('/test-url')
      expect(error.severity).toBe('error')
      expect(error.stack).toBe('Error: Test message\n    at test.js:1:1')
    })

    it('reconstructs an error from a JSON object with minimal fields', () => {
      const json = {
        name: 'BaseError',
        message: 'Minimal message',
      }

      const error = BaseError.fromJSON(json)

      expect(error).toBeInstanceOf(BaseError)
      expect(error.name).toBe('BaseError')
      expect(error.message).toBe('Minimal message')
      expect(error.title).toBe('FooError')
      expect(error.description).toBe('Minimal message')
      expect(error.action).toBe('Reset')
      expect(error.actionUrl).toBe('/')
      expect(error.severity).toBe('error')
    })

    it('reconstructs an error with a cause', () => {
      const cause = {custom: 'cause object'}
      const json = {
        name: 'BaseError',
        message: 'Test message',
        cause,
      }

      const error = BaseError.fromJSON(json)

      expect(error.cause).toBe(cause)
    })

    it('reconstructs an error with a cause Error object', () => {
      const cause = {name: 'Error', message: 'Cause error message'}
      const json = {
        name: 'BaseError',
        message: 'Test message',
        cause,
      }

      const error = BaseError.fromJSON(json)

      expect(error.cause).toEqual(cause)
    })

    it('handles missing name and uses default', () => {
      const json = {
        message: 'Test message',
      }

      const error = BaseError.fromJSON(json)

      expect(error.name).toBe('BaseError')
    })

    it('handles missing message and uses default', () => {
      const json = {
        name: 'BaseError',
      }

      const error = BaseError.fromJSON(json)

      expect(error.message).toBe('Error')
    })
  })

  describe('round-trip serialization', () => {
    it('preserves all fields through toJSON and fromJSON', () => {
      const original = new BaseError('Original message', {
        title: 'Original Title',
        description: 'Original Description',
        action: 'Original Action',
        actionUrl: '/original-url',
        severity: 'error',
      })

      const json = original.toJSON()
      const reconstructed = BaseError.fromJSON(json)

      expect(reconstructed.name).toBe(original.name)
      expect(reconstructed.message).toBe(original.message)
      expect(reconstructed.title).toBe(original.title)
      expect(reconstructed.description).toBe(original.description)
      expect(reconstructed.action).toBe(original.action)
      expect(reconstructed.actionUrl).toBe(original.actionUrl)
      expect(reconstructed.severity).toBe(original.severity)
      expect(reconstructed.stack).toBe(original.stack)
    })

    it('preserves Error cause through round-trip', () => {
      const causeError = new Error('Cause error message')
      const original = new BaseError('Test message', {
        cause: causeError,
      })

      const json = original.toJSON()
      const reconstructed = BaseError.fromJSON(json)

      expect(reconstructed.cause).toEqual({
        name: 'Error',
        message: 'Cause error message',
      })
    })

    it('preserves non-Error cause through round-trip', () => {
      const cause = {custom: 'cause object', nested: {value: 123}}
      const original = new BaseError('Test message', {
        cause,
      })

      const json = original.toJSON()
      const reconstructed = BaseError.fromJSON(json)

      expect(reconstructed.cause).toBe(cause)
    })

    it('preserves subclass error through round-trip', () => {
      const original = new OutOfMemoryError('Out of memory message')

      const json = original.toJSON()
      const reconstructed = BaseError.fromJSON(json)

      expect(reconstructed.name).toBe('OutOfMemoryError')
      expect(reconstructed.message).toBe('Out of memory message')
      expect(reconstructed.title).toBe('Out of Memory')
      expect(reconstructed.description).toBe('Out of memory message')
      expect(reconstructed.severity).toBe('error')
    })
  })
})

