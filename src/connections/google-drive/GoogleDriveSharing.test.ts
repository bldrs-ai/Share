/**
 * Unit tests for GoogleDriveSharing — Drive Permissions API transport,
 * principal-shape mapping, visibility derivation, and typed-error mapping.
 *
 * Tests stub `fetch` directly (matching GoogleDriveProvider.test.ts) so the
 * helpers are exercised without OAuth machinery.
 */

import {GrantFailedError, InsufficientPermissionError, NeedsReconnectError} from '../errors'
import type {Connection, ResourceRef} from '../types'
import {
  driveGetVisibility,
  driveListGrants,
  driveRevokeGrant,
  driveSetVisibility,
  driveShareWith,
} from './GoogleDriveSharing'


const TOKEN = 'test-token'
const FILE_ID = 'file-abc'
const FOLDER_ID = 'folder-xyz'

// Named HTTP status codes — keeps the eslint no-magic-numbers rule happy and
// makes intent clearer at the call site.
const HTTP_OK = 200
const HTTP_NO_CONTENT = 204
const HTTP_OK_RANGE_END = 300
const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403
const HTTP_INTERNAL = 500


/**
 * Build a Connection for tests with sensible defaults; overrides merge last.
 *
 * @return The constructed Connection.
 */
function mkConnection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: 'conn-1',
    providerId: 'google-drive',
    label: 'pablo@bldrs.ai - GDrive',
    status: 'connected',
    auth0Connection: 'google-oauth2',
    createdAt: '2026-05-01T00:00:00Z',
    meta: {email: 'pablo@bldrs.ai'},
    ...overrides,
  }
}

const FILE_RESOURCE: ResourceRef = {kind: 'drive-file', fileId: FILE_ID}
const FOLDER_RESOURCE: ResourceRef = {kind: 'drive-folder', folderId: FOLDER_ID}

let originalFetch: typeof global.fetch
let mockFetch: jest.Mock

beforeEach(() => {
  originalFetch = global.fetch
  mockFetch = jest.fn()
  global.fetch = mockFetch as unknown as typeof global.fetch
})

afterEach(() => {
  global.fetch = originalFetch
})


/**
 * Build a `Response`-shaped object for fetch stubs without going through a
 * polyfill. Stringifies non-string bodies into the `text()` resolution so
 * the typed-error mapper can read either shape.
 *
 * @return A minimal Response stand-in suitable for the helpers under test.
 */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= HTTP_OK && status < HTTP_OK_RANGE_END,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response
}


/**
 * Build a `Response` with no body — used for DELETE 204 replies, which the
 * helpers don't read but `driveFetch` still inspects.
 *
 * @return A minimal Response stand-in with empty json/text resolutions.
 */
function emptyResponse(status: number): Response {
  return {
    ok: status >= HTTP_OK && status < HTTP_OK_RANGE_END,
    status,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  } as unknown as Response
}


describe('driveListGrants', () => {
  it('maps Drive permissions onto provider-neutral grants', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(HTTP_OK, {
      permissions: [
        {id: 'p1', type: 'user', role: 'writer', emailAddress: 'a@example.com'},
        {id: 'p2', type: 'domain', role: 'reader', domain: 'bldrs.ai'},
        {id: 'p3', type: 'anyone', role: 'reader'},
      ],
    }))

    const grants = await driveListGrants(mkConnection(), FILE_RESOURCE, TOKEN)

    expect(grants).toEqual([
      {id: 'p1', principalType: 'user', principalId: 'a@example.com', role: 'writer', origin: 'drive'},
      {id: 'p2', principalType: 'domain', principalId: 'bldrs.ai', role: 'reader', origin: 'drive'},
      {id: 'p3', principalType: 'anyone', principalId: undefined, role: 'reader', origin: 'drive'},
    ])
  })

  it('downcasts Shared Drive organizer/fileOrganizer roles to writer', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(HTTP_OK, {
      permissions: [
        {id: 'p1', type: 'user', role: 'organizer', emailAddress: 'a@x.com'},
        {id: 'p2', type: 'user', role: 'fileOrganizer', emailAddress: 'b@x.com'},
      ],
    }))

    const grants = await driveListGrants(mkConnection(), FOLDER_RESOURCE, TOKEN)

    expect(grants.map((g) => g.role)).toEqual(['writer', 'writer'])
  })

  it('lowercases domain principalIds for case-robust comparisons', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(HTTP_OK, {
      permissions: [{id: 'p', type: 'domain', role: 'reader', domain: 'BLDRS.AI'}],
    }))

    const grants = await driveListGrants(mkConnection(), FILE_RESOURCE, TOKEN)
    expect(grants[0].principalId).toBe('bldrs.ai')
  })

  it('returns [] when the response omits the permissions field', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(HTTP_OK, {}))
    const grants = await driveListGrants(mkConnection(), FILE_RESOURCE, TOKEN)
    expect(grants).toEqual([])
  })

  it('targets /files/{id}/permissions with supportsAllDrives', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(HTTP_OK, {permissions: []}))
    await driveListGrants(mkConnection(), FILE_RESOURCE, TOKEN)

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toMatch(`/drive/v3/files/${FILE_ID}/permissions`)
    expect(url).toMatch('supportsAllDrives=true')
    expect((init as RequestInit).headers).toMatchObject({Authorization: `Bearer ${TOKEN}`})
  })

  it('accepts drive-folder resources', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(HTTP_OK, {permissions: []}))
    await driveListGrants(mkConnection(), FOLDER_RESOURCE, TOKEN)

    const [url] = mockFetch.mock.calls[0]
    expect(url).toMatch(`/drive/v3/files/${FOLDER_ID}/permissions`)
  })

  it('rejects github-shaped resources with GrantFailedError(wrong_provider)', async () => {
    const ghResource: ResourceRef = {kind: 'github-repo', org: 'bldrs-ai', repo: 'Share'}
    await expect(driveListGrants(mkConnection(), ghResource, TOKEN)).rejects.toMatchObject({
      name: 'GrantFailedError',
      cause: 'wrong_provider',
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('maps 401 onto NeedsReconnectError', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(HTTP_UNAUTHORIZED, {error: 'invalid_token'}))
    await expect(driveListGrants(mkConnection(), FILE_RESOURCE, TOKEN)).rejects.toBeInstanceOf(NeedsReconnectError)
  })

  it('maps 403 onto InsufficientPermissionError', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(HTTP_FORBIDDEN, {error: 'forbidden'}))
    await expect(driveListGrants(mkConnection(), FILE_RESOURCE, TOKEN)).rejects.toBeInstanceOf(InsufficientPermissionError)
  })

  it('maps other 4xx/5xx onto GrantFailedError with http_<status> cause', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(HTTP_INTERNAL, 'boom'))
    const err = await driveListGrants(mkConnection(), FILE_RESOURCE, TOKEN).catch((e) => e)
    expect(err).toBeInstanceOf(GrantFailedError)
    expect(err.cause).toBe('http_500')
  })
})


describe('driveShareWith', () => {
  it('emits emailAddress for user grants and forwards notify+message', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(HTTP_OK, {
      id: 'p9', type: 'user', role: 'reader', emailAddress: 'b@x.com',
    }))

    const result = await driveShareWith(
      mkConnection(),
      FILE_RESOURCE,
      {principalType: 'user', principalId: 'b@x.com', role: 'reader', notify: true, message: 'hi'},
      TOKEN,
    )

    expect(result).toEqual({
      id: 'p9', principalType: 'user', principalId: 'b@x.com', role: 'reader', origin: 'drive',
    })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toMatch('sendNotificationEmail=true')
    expect(url).toMatch('emailMessage=hi')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toEqual({type: 'user', role: 'reader', emailAddress: 'b@x.com'})
  })

  it('forwards sendNotificationEmail=false when notify is explicitly false', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(HTTP_OK, {
      id: 'p9b', type: 'user', role: 'reader', emailAddress: 'c@x.com',
    }))
    await driveShareWith(
      mkConnection(),
      FILE_RESOURCE,
      {principalType: 'user', principalId: 'c@x.com', role: 'reader', notify: false, message: 'should be dropped'},
      TOKEN,
    )
    const [url] = mockFetch.mock.calls[0]
    expect(url).toMatch('sendNotificationEmail=false')
    expect(url).not.toMatch('emailMessage') // message dropped when notify off
  })

  it('omits sendNotificationEmail for domain and anyone grants', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(HTTP_OK, {
      id: 'p10', type: 'anyone', role: 'reader',
    }))
    await driveShareWith(
      mkConnection(),
      FILE_RESOURCE,
      {principalType: 'anyone', role: 'reader'},
      TOKEN,
    )
    const [url] = mockFetch.mock.calls[0]
    expect(url).not.toMatch('sendNotificationEmail')
    expect(url).not.toMatch('emailMessage')
  })

  it('emits domain field for domain grants', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(HTTP_OK, {
      id: 'p11', type: 'domain', role: 'reader', domain: 'bldrs.ai',
    }))
    await driveShareWith(
      mkConnection(),
      FILE_RESOURCE,
      {principalType: 'domain', principalId: 'bldrs.ai', role: 'reader'},
      TOKEN,
    )
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual({type: 'domain', role: 'reader', domain: 'bldrs.ai'})
  })

  it('rejects user grants without principalId', async () => {
    await expect(driveShareWith(
      mkConnection(),
      FILE_RESOURCE,
      {principalType: 'user', role: 'reader'},
      TOKEN,
    )).rejects.toMatchObject({name: 'GrantFailedError', cause: 'principal_required'})
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('rejects domain grants without principalId', async () => {
    await expect(driveShareWith(
      mkConnection(),
      FILE_RESOURCE,
      {principalType: 'domain', role: 'reader'},
      TOKEN,
    )).rejects.toMatchObject({name: 'GrantFailedError', cause: 'principal_required'})
  })
})


describe('driveRevokeGrant', () => {
  it('issues DELETE on /files/{id}/permissions/{grantId}', async () => {
    mockFetch.mockResolvedValueOnce(emptyResponse(HTTP_NO_CONTENT))
    await driveRevokeGrant(mkConnection(), FILE_RESOURCE, 'p1', TOKEN)

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toMatch(`/files/${FILE_ID}/permissions/p1`)
    expect((init as RequestInit).method).toBe('DELETE')
  })
})


describe('driveGetVisibility', () => {
  /** Queue a single permissions.list response for the next driveListGrants call. */
  function withGrants(perms: Array<Record<string, unknown>>): void {
    mockFetch.mockResolvedValueOnce(jsonResponse(HTTP_OK, {permissions: perms}))
  }

  it('returns public when an anyone permission exists', async () => {
    withGrants([{id: 'p', type: 'anyone', role: 'reader'}])
    expect(await driveGetVisibility(mkConnection(), FILE_RESOURCE, TOKEN)).toBe('public')
  })

  it('public wins over org when both apply', async () => {
    withGrants([
      {id: 'p1', type: 'anyone', role: 'reader'},
      {id: 'p2', type: 'domain', role: 'reader', domain: 'bldrs.ai'},
    ])
    expect(await driveGetVisibility(mkConnection(), FILE_RESOURCE, TOKEN)).toBe('public')
  })

  it('returns org when a domain permission matches the connection email', async () => {
    withGrants([{id: 'p', type: 'domain', role: 'reader', domain: 'bldrs.ai'}])
    expect(await driveGetVisibility(mkConnection(), FILE_RESOURCE, TOKEN)).toBe('org')
  })

  it('returns null when domain perm exists but connection has no email', async () => {
    withGrants([{id: 'p', type: 'domain', role: 'reader', domain: 'bldrs.ai'}])
    const conn = mkConnection({meta: {}})
    expect(await driveGetVisibility(conn, FILE_RESOURCE, TOKEN)).toBeNull()
  })

  it('returns null when domain perm exists but connection is a personal Google (gmail) account', async () => {
    // Free-email domain → workspaceDomain returns null → "unknowable" branch.
    // Without this guard, a personal-Google user calling setVisibility('org')
    // would attempt to grant `domain: 'gmail.com'` (i.e. share with every
    // Gmail user worldwide). Tested here on the read side; the write-side
    // guard is exercised in the driveSetVisibility suite below.
    withGrants([{id: 'p', type: 'domain', role: 'reader', domain: 'bldrs.ai'}])
    const conn = mkConnection({meta: {email: 'someone@gmail.com'}})
    expect(await driveGetVisibility(conn, FILE_RESOURCE, TOKEN)).toBeNull()
  })

  it('matches domain case-insensitively against connection email', async () => {
    withGrants([{id: 'p', type: 'domain', role: 'reader', domain: 'bldrs.ai'}])
    const conn = mkConnection({meta: {email: 'PABLO@BLDRS.AI'}})
    expect(await driveGetVisibility(conn, FILE_RESOURCE, TOKEN)).toBe('org')
  })

  it('returns private when domain perm is for a different workspace', async () => {
    withGrants([{id: 'p', type: 'domain', role: 'reader', domain: 'other.com'}])
    expect(await driveGetVisibility(mkConnection(), FILE_RESOURCE, TOKEN)).toBe('private')
  })

  it('returns private when only user/group permissions exist', async () => {
    withGrants([{id: 'p', type: 'user', role: 'writer', emailAddress: 'a@x.com'}])
    expect(await driveGetVisibility(mkConnection(), FILE_RESOURCE, TOKEN)).toBe('private')
  })
})


describe('driveSetVisibility', () => {
  /** Queue a sequence of fetch responses for driveSetVisibility's list+mutate calls. */
  function withSequence(...responses: Response[]): void {
    for (const r of responses) {
      mockFetch.mockResolvedValueOnce(r)
    }
  }

  it('public is a no-op when an anyone permission already exists', async () => {
    withSequence(jsonResponse(HTTP_OK, {permissions: [{id: 'p', type: 'anyone', role: 'reader'}]}))
    await driveSetVisibility(mkConnection(), FILE_RESOURCE, 'public', TOKEN)
    expect(mockFetch).toHaveBeenCalledTimes(1) // list only, no POST
  })

  it('public adds an anyone reader permission when missing', async () => {
    withSequence(
      jsonResponse(HTTP_OK, {permissions: []}),
      jsonResponse(HTTP_OK, {id: 'p9', type: 'anyone', role: 'reader'}),
    )
    await driveSetVisibility(mkConnection(), FILE_RESOURCE, 'public', TOKEN)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    const body = JSON.parse((mockFetch.mock.calls[1][1] as RequestInit).body as string)
    expect(body).toMatchObject({type: 'anyone', role: 'reader'})
  })

  it('org throws GrantFailedError(domain_unknown) without connection email', async () => {
    withSequence(jsonResponse(HTTP_OK, {permissions: []}))
    const conn = mkConnection({meta: {}})
    await expect(driveSetVisibility(conn, FILE_RESOURCE, 'org', TOKEN)).rejects.toMatchObject({
      name: 'GrantFailedError', cause: 'domain_unknown',
    })
  })

  it('org throws GrantFailedError(domain_unknown) for personal Google (free-email) accounts', async () => {
    // Security guard: prevents `domain: 'gmail.com'` from being granted,
    // which would otherwise expose the file to every Gmail user worldwide.
    withSequence(jsonResponse(HTTP_OK, {permissions: []}))
    const conn = mkConnection({meta: {email: 'someone@gmail.com'}})
    await expect(driveSetVisibility(conn, FILE_RESOURCE, 'org', TOKEN)).rejects.toMatchObject({
      name: 'GrantFailedError', cause: 'domain_unknown',
    })
  })

  it('org is a no-op when a matching-domain permission already exists', async () => {
    withSequence(jsonResponse(HTTP_OK, {permissions: [
      {id: 'p1', type: 'domain', role: 'reader', domain: 'bldrs.ai'},
    ]}))
    await driveSetVisibility(mkConnection(), FILE_RESOURCE, 'org', TOKEN)
    expect(mockFetch).toHaveBeenCalledTimes(1) // list only, no POST
  })

  it('org adds a domain permission for the connection workspace', async () => {
    withSequence(
      jsonResponse(HTTP_OK, {permissions: []}),
      jsonResponse(HTTP_OK, {id: 'p9', type: 'domain', role: 'reader', domain: 'bldrs.ai'}),
    )
    await driveSetVisibility(mkConnection(), FILE_RESOURCE, 'org', TOKEN)
    const body = JSON.parse((mockFetch.mock.calls[1][1] as RequestInit).body as string)
    expect(body).toMatchObject({type: 'domain', domain: 'bldrs.ai', role: 'reader'})
  })

  it('private removes anyone and matching-domain grants, preserves user grants', async () => {
    withSequence(
      jsonResponse(HTTP_OK, {permissions: [
        {id: 'p1', type: 'anyone', role: 'reader'},
        {id: 'p2', type: 'domain', role: 'reader', domain: 'bldrs.ai'},
        {id: 'p3', type: 'user', role: 'writer', emailAddress: 'a@x.com'},
      ]}),
      emptyResponse(HTTP_NO_CONTENT), // delete p1
      emptyResponse(HTTP_NO_CONTENT), // delete p2
    )
    await driveSetVisibility(mkConnection(), FILE_RESOURCE, 'private', TOKEN)
    expect(mockFetch).toHaveBeenCalledTimes(3)
    const deletedUrls = mockFetch.mock.calls.slice(1).map(([url]) => url as string)
    expect(deletedUrls.some((u) => u.includes('/permissions/p1'))).toBe(true)
    expect(deletedUrls.some((u) => u.includes('/permissions/p2'))).toBe(true)
    expect(deletedUrls.some((u) => u.includes('/permissions/p3'))).toBe(false)
  })

  it('private removes all domain grants when own-domain is unknown', async () => {
    withSequence(
      jsonResponse(HTTP_OK, {permissions: [
        {id: 'p1', type: 'domain', role: 'reader', domain: 'other.com'},
      ]}),
      emptyResponse(HTTP_NO_CONTENT),
    )
    const conn = mkConnection({meta: {}})
    await driveSetVisibility(conn, FILE_RESOURCE, 'private', TOKEN)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('private aggregates a partial revoke failure as GrantFailedError(partial_revoke)', async () => {
    // Two grants to revoke; the second DELETE fails with a 5xx. The first
    // already succeeded — caller needs a typed signal that state is
    // half-applied, not silent success and not a bare HTTP error.
    withSequence(
      jsonResponse(HTTP_OK, {permissions: [
        {id: 'p1', type: 'anyone', role: 'reader'},
        {id: 'p2', type: 'domain', role: 'reader', domain: 'bldrs.ai'},
      ]}),
      emptyResponse(HTTP_NO_CONTENT), // p1 revoke succeeds
      jsonResponse(HTTP_INTERNAL, 'boom'), // p2 revoke fails
    )
    const err = await driveSetVisibility(mkConnection(), FILE_RESOURCE, 'private', TOKEN)
      .catch((e) => e)
    expect(err).toMatchObject({name: 'GrantFailedError', cause: 'partial_revoke'})
    expect((err as Error).message).toMatch('p2')
  })

  it('private propagates NeedsReconnectError when every revoke fails with 401', async () => {
    // All-failures-of-the-same-class is a coherent signal — surface it as
    // the typed error directly so UI routes to Reconnect, not partial_revoke.
    withSequence(
      jsonResponse(HTTP_OK, {permissions: [
        {id: 'p1', type: 'anyone', role: 'reader'},
        {id: 'p2', type: 'domain', role: 'reader', domain: 'bldrs.ai'},
      ]}),
      jsonResponse(HTTP_UNAUTHORIZED, {error: 'invalid_token'}),
      jsonResponse(HTTP_UNAUTHORIZED, {error: 'invalid_token'}),
    )
    await expect(driveSetVisibility(mkConnection(), FILE_RESOURCE, 'private', TOKEN))
      .rejects.toMatchObject({name: 'NeedsReconnectError'})
  })
})
