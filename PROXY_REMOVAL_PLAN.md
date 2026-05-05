# Proxy Removal Plan

Plan to remove the `gitredir-prod` proxy entirely and have the SPA fetch
GitHub-hosted models directly from the browser.

## Background

Today, unauthenticated public file loads are routed through
`https://rawgit.bldrs.dev` (the Fly app `gitredir-prod`, source repo
`bldrs-ai/gitredir`). Authenticated loads already go to GitHub directly.

The proxy exists historically because:

- Detecting Git LFS pointers required a Range request on
  `raw.githubusercontent.com`, which triggers CORS preflight, which RGHUC does
  not honor (preflight returns 403). So the Range probe had to be done
  server-side.

A 2026-05-01 incident exposed the proxy as a single point of failure:
`gitredir-prod`'s shared Fly NAT egress IPv6
(`2605:6440:d000:343:0:cb89:5f81:1`) hit a noisy-neighbor block on
`raw.githubusercontent.com` (Fastly RST during read on every request). All
unauthenticated demo loads broke. Fly pins egress IPv6 per-machine, so a
restart did not help; only `flyctl machine clone` (new machine ID -> new egress
IP) shifted us off the poisoned IP.

The structural fix is to delete the proxy and have the SPA hit GitHub
directly.

## Spike findings (2026-05-01)

Verified via `curl` with `Origin: https://bldrs.ai`:

| Endpoint | Verdict |
|---|---|
| `api.github.com` Contents API, simple GET | CORS allow-origin `*` |
| Contents API on an LFS pointer file | Returns `download_url` already pointing at `media.githubusercontent.com/media/...` |
| Contents API includes inline `content` (base64 of LFS pointer) for LFS files | Yes |
| `raw.githubusercontent.com` simple GET | CORS allow-origin `*` |
| `raw.githubusercontent.com` preflight w/ Range | 403 (still blocked - but no longer needed) |
| `media.githubusercontent.com` simple GET | CORS allow-origin `*` |

The key insight: **the Contents API already returns the LFS-aware
`download_url` for us.** We do not need to detect LFS client-side or do a
Range request. The browser fetches the URL the API hands it, regardless of
LFS status.

## What changes

### Phase 1 - Unify auth/unauth in URL resolution

**Files:**

- `src/loader/urls.js` (`dereferenceAndProxyDownloadContents`, line 119)
- `src/net/github/Files.js` (`getPathContents`, line 321)

**Changes:**

- Drop the `if (!accessToken)` proxy branch in
  `dereferenceAndProxyDownloadContents`. Both authed and unauth flow into
  `getGitHubPathContents`. Rename the function to
  `dereferenceDownloadContents` (it does not proxy anymore).
- `getPathContents` needs no behavior change. Confirm Octokit allows
  unauthenticated requests (it does; just hits the public 60/hr limit).
- The branch at `Files.js:346-353` already does the right thing for LFS by
  accident: LFS `download_url` is `media.githubusercontent.com`, so the
  `download_url.includes('raw.githubusercontent.com')` check is false, and we
  fall through to using the download_url directly. Keep the behavior, but
  rename the misleading variable comments.

**Validation:**

- Unauth load of `Swiss-Property-AG/Momentum-Public/main/Momentum.ifc` (regular).
- Unauth load of `bldrs-ai/test-models/main/ifc/sp/sp-231MB.ifc` (LFS).
- Authed load to confirm no regression.

### Phase 2 - Simplify the OPFS worker

**File:** `src/OPFS/OPFS.worker.js`

The worker today assumes the proxy's two-step protocol: fetch JSON, parse
`{etag, finalURL}`, then fetch `finalURL`. After Phase 1 the URL we receive
*is* the final URL.

**Changes:**

- `fetchAndHeadRequest` (line 271-305): collapse to a single
  `fetch(url, {headers: ETag ? {'If-None-Match': etag} : {}})`. Read ETag from
  response headers. Return `{modelResponse, etag}`.
- Fix the error-handling bug exposed by the 2026-05-01 incident: the existing
  catch swallows errors and returns `undefined`, then `downloadModel` blindly
  destructures, producing the unhelpful "Cannot destructure property
  'proxyResponse' of 'S' as it is undefined" message. Either rethrow or
  return a tagged error and surface it to the user.
- `downloadModel` (line 854 onwards): drop `proxyResponse` from destructures.
  The cache update calls at lines 884 and 921
  (`CacheModule.updateCacheRaw(cacheKey, proxyResponse, ...)`) currently cache
  the proxy's JSON wrapper, not the model. Replace with a synthetic response
  (mirroring `generateMockResponse(shaHash)` already used at line 837) since
  there is no separate metadata response.
- Conditional check at line 857 (`if (result === null)`) needs to also handle
  `undefined` (or, after the rewrite, the tagged error case).

### Phase 3 - Clean up build/test wiring

**Files:**

- `tools/esbuild/vars.prod.js`, `vars.playwright.js`, `vars.cypress.js`
- `tools/jest/vars.jest.js`, `tools/jest/testEnvVars.js`
- `.github/workflows/test-flows.yml`
- `src/net/github/Files.fixture.js`
- `src/Components/Versions/VersionsPanel.fixture.js`
- `src/Containers/urls.test.js`, `src/loader/Loader.cover.test.js`,
  `src/OPFS/OPFS.worker.test.js`
- MSW handlers (search for `rawgit.bldrs.dev.msw`, `rawgit.bldrs.dev.jest`)

**Changes:**

- Remove `RAW_GIT_PROXY_URL` and `RAW_GIT_PROXY_URL_NEW` env vars everywhere.
- Update fixtures to reference `raw.githubusercontent.com` /
  `media.githubusercontent.com`.
- Update MSW handlers to intercept the GitHub hosts directly.

Mechanical but touches many files; can land as its own PR.

### Phase 4 - Decommission `gitredir-prod`

After Share has been on the new path in prod for 1-2 weeks of soak:

1. `flyctl machine stop -a gitredir-prod` (reversible).
2. Watch Share telemetry for any 4xx/5xx pointing at the old proxy URL.
3. `flyctl apps destroy gitredir-prod`.
4. Archive `bldrs-ai/gitredir` repo with a README pointer to this plan.

Worth explicit go-ahead at the time, not in advance.

## PR shape

- **PR 1**: Phase 1 + Phase 2 (tightly coupled).
- **PR 2**: Phase 3 (test/build cleanup).
- **Phase 4**: ops work, no PR.

## Risks and open questions

- **Unauth API rate limit (60/hr/IP).** Per-user fine; corporate-NATted
  shared egresses could trip it. Possible fallback: catch
  `403 X-RateLimit-Remaining: 0` in `getPathContents` and fall back to
  constructing `raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}`
  directly without the API call. Works for non-LFS files. For LFS, similar
  fallback to `media.githubusercontent.com/media/...` (treat 404 as "this is
  non-LFS, retry against raw"). Recommendation: defer this until telemetry
  shows it actually bites.
- **Caching strategy unchanged.** OPFS-side cache continues to work the same
  way (key by repo+path+etag). CDN-side caching that gitredir was *not* doing
  also remains undone. Worth a separate think later for hot demo files.
- **What this does not address.** This plan does not change the auth/private
  repo flow, the OAuth proxy (`share-oauth-proxy`), or the OPFS caching
  layer's storage layout.

## Status

- 2026-05-01: Spike done. Migration plan written. `gitredir-prod` rotated to
  a new egress IP as a stopgap so demos work over the weekend. Code changes
  not started.
