import {createMemoryConversationStore} from './conversation'


describe('assist/conversation', () => {
  it('round-trips messages whole, providerOptions included, as copies', async () => {
    const store = createMemoryConversationStore()
    // The fields D10 says must survive: Gemini's thought signature and
    // OpenRouter's reasoning_details, on the message and on a part.
    const assistant = {
      role: 'assistant',
      content: [
        {type: 'reasoning', text: 'hm', providerOptions: {openrouter: {reasoning_details: [{type: 'reasoning.encrypted', data: 'X'}]}}},
        {type: 'tool-call', toolCallId: 'c1', toolName: 'view_select', input: {refs: ['e1']},
          providerOptions: {google: {thoughtSignature: 'sig-1'}}},
      ],
      providerOptions: {openrouter: {annotations: []}},
    }
    const tool = {role: 'tool', content: [{type: 'tool-result', toolCallId: 'c1', toolName: 'view_select',
      output: {type: 'json', value: {selected: 1}}}]}
    await store.append('a', [{role: 'user', content: 'hi'}, assistant])
    await store.append('a', [tool])
    const loaded = await store.load('a')
    expect(loaded).toEqual([{role: 'user', content: 'hi'}, assistant, tool])
    // A copy, not the caller's object: later edits to either don't leak.
    expect(loaded[1]).not.toBe(assistant)
    loaded[1].providerOptions.openrouter.annotations.push('x')
    expect((await store.load('a'))[1].providerOptions).toEqual({openrouter: {annotations: []}})
  })

  it('keeps conversations apart, and a new one is empty', async () => {
    const store = createMemoryConversationStore()
    await store.append('a', [{role: 'user', content: 'one'}])
    expect(await store.load('b')).toEqual([])
    expect((await store.load('a')).map((m) => m.content)).toEqual(['one'])
  })
})
