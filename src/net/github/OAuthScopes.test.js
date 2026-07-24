import {getOAuthScopes} from './OAuthScopes'


describe('net/github/OAuthScopes', () => {
  it('parses the X-OAuth-Scopes header into a scope list', async () => {
    const scopes = await getOAuthScopes('testtoken')
    expect(scopes).toEqual(['public_repo', 'read:org', 'read:user', 'user:email'])
  })
})
