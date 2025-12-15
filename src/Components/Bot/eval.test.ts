import {safeJsonFromCodeBlock} from './eval'


describe('eval', () => {
  it('should return the correct result', () => {
    const result = safeJsonFromCodeBlock('```json\n{\n"assistant_response": "Hello, world!",\n"client_code": "return [];"\n}\n```')
    expect(result).toEqual({assistant_response: 'Hello, world!', client_code: 'return [];'})
  })

  it('should return null if the code block is not valid JSON', () => {
    const result = safeJsonFromCodeBlock('```json { : "Hello, world!", "client_code": "return [];" } ```')
    expect(result).toEqual(null)
  })
})
