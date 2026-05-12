/**
 * Tests for GitHubBrowser — covers the Contents API mappings and the
 * 401 → NeedsReconnectError mapping. Mirrors the test shape of
 * GoogleDriveBrowser-style tests: stub `global.fetch`, exercise the
 * methods, assert URLs / headers / outputs.
 */

import type {Connection, Source} from '../types'
import {NeedsReconnectError} from '../errors'
import {githubBrowser} from './GitHubBrowser'
import {githubProvider} from './GitHubProvider'


jest.mock('./GitHubProvider', () => ({
  githubProvider: {getAccessToken: jest.fn()},
}))


const connection: Connection = {
  id: 'gh-conn-1',
  providerId: 'github',
  label: 'octo - GitHub',
  status: 'connected',
  createdAt: new Date().toISOString(),
  meta: {},
}


const source: Source = {
  id: 'src-1',
  connectionId: 'gh-conn-1',
  providerId: 'github',
  label: 'octo/widget@main',
  location: {
    type: 'github',
    org: 'octo',
    repo: 'widget',
    branch: 'main',
    path: 'models',
  },
  createdAt: new Date().toISOString(),
}


let fetchMock: jest.Mock
let originalFetch: typeof global.fetch


beforeAll(() => {
  originalFetch = global.fetch
})


afterAll(() => {
  global.fetch = originalFetch
})


beforeEach(() => {
  jest.clearAllMocks()
  fetchMock = jest.fn()
  global.fetch = fetchMock as unknown as typeof global.fetch
  ;(githubProvider.getAccessToken as jest.Mock).mockResolvedValue('gh-token-abc')
})


describe('githubBrowser.listFiles', () => {
  it('hits /repos/{org}/{repo}/contents/{path}?ref={branch} with auth and version pin', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    })

    await githubBrowser.listFiles(connection, source)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/octo/widget/contents/models?ref=main')
    expect(init.headers).toMatchObject({
      'Authorization': 'Bearer gh-token-abc',
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    })
  })

  it('uses the path override when provided (ignores location.path)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    })

    await githubBrowser.listFiles(connection, source, 'docs/sub')

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/octo/widget/contents/docs/sub?ref=main',
    )
  })

  it('separates files from folders, sorts both, and surfaces sha in meta', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        {type: 'file', name: 'b.ifc', path: 'models/b.ifc', size: 100, sha: 'sha-b'},
        {type: 'dir', name: 'arch', path: 'models/arch'},
        {type: 'file', name: 'a.ifc', path: 'models/a.ifc', size: 200, sha: 'sha-a'},
        {type: 'dir', name: 'mep', path: 'models/mep'},
        {type: 'symlink', name: 'broken', path: 'models/broken'},
        {type: 'submodule', name: 'sub', path: 'models/sub'},
      ]),
    })

    const result = await githubBrowser.listFiles(connection, source)

    expect(result.folders).toEqual([
      {id: 'models/arch', name: 'arch'},
      {id: 'models/mep', name: 'mep'},
    ])
    expect(result.files).toEqual([
      {id: 'models/a.ifc', name: 'a.ifc', size: 200, meta: {sha: 'sha-a'}},
      {id: 'models/b.ifc', name: 'b.ifc', size: 100, meta: {sha: 'sha-b'}},
    ])
  })

  it('encodes spaces in the path but preserves slash separators', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    })

    await githubBrowser.listFiles(connection, source, 'has spaces/and/sub dir')

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/octo/widget/contents/has%20spaces/and/sub%20dir?ref=main',
    )
  })

  it('throws NeedsReconnectError on 401', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Bad credentials'),
    })

    await expect(githubBrowser.listFiles(connection, source))
      .rejects.toBeInstanceOf(NeedsReconnectError)
  })

  it('throws a generic error preserving status on 403', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve('rate limit exceeded'),
    })

    await expect(githubBrowser.listFiles(connection, source))
      .rejects.toMatchObject({status: 403})
  })

  it('throws a clear error when the path resolves to a file (not a directory)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      // Contents API returns a single object for files, an array for dirs.
      json: () => Promise.resolve({type: 'file', name: 'x.ifc'}),
    })

    await expect(githubBrowser.listFiles(connection, source))
      .rejects.toThrow(/expected a directory/)
  })
})


describe('githubBrowser.getFileDownload', () => {
  it('fetches metadata then raw blob and returns filename + blob', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({type: 'file', name: 'model.ifc', sha: 'sha-1', size: 1024}),
      })
      .mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(['ifc-bytes'])),
      })

    const result = await githubBrowser.getFileDownload(connection, source, 'models/model.ifc')

    expect(result.filename).toBe('model.ifc')
    expect(result.blob).toBeInstanceOf(Blob)
    expect(fetchMock.mock.calls[0][1].headers.Accept).toBe('application/vnd.github+json')
    expect(fetchMock.mock.calls[1][1].headers.Accept).toBe('application/vnd.github.raw')
  })

  it('throws NeedsReconnectError on 401 from the metadata call', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Bad credentials'),
    })

    await expect(githubBrowser.getFileDownload(connection, source, 'models/model.ifc'))
      .rejects.toBeInstanceOf(NeedsReconnectError)
  })

  it('throws a clear error when the path resolves to a directory', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{type: 'file', name: 'inner.ifc'}]),
    })

    await expect(githubBrowser.getFileDownload(connection, source, 'models'))
      .rejects.toThrow(/is not a file/)
  })
})


describe('githubBrowser.pickLocation', () => {
  it('throws — OpenModelDialog\'s GitHub flow drives interactive selection', () => {
    expect(() => githubBrowser.pickLocation(connection))
      .toThrow(/GitHubFileBrowser/)
  })
})
