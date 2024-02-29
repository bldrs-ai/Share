import {getOrganizations} from './Organizations'


describe('net/github/Organizations', () => {
  it('encounters an exception if no access token is provided', () => {
    expect(() => getOrganizations()).rejects
      .toThrowError('Arg 0 is not defined')
  })

  it('receives a list of organizations', async () => {
    const orgs = await getOrganizations('testtoken')
    expect(orgs).toHaveLength(1)
    const org = orgs[0]
    expect(org.login).toEqual('bldrs-ai')
  })
})
