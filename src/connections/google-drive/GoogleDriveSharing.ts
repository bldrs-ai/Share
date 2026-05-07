/**
 * Google Drive sharing capability — pure transport for the Drive
 * Permissions API. The five exported functions (`listGrants`, `shareWith`,
 * `revokeGrant`, `getVisibility`, `setVisibility`) mirror the optional
 * sharing methods on `ConnectionProvider`, returning typed errors from
 * `src/connections/errors.ts` rather than `Response`s.
 *
 * Each function takes an explicit access token so it can be unit-tested
 * without exercising the OAuth machinery in `GoogleDriveProvider`. The
 * provider object owns token acquisition and merely delegates here.
 *
 * Scope: `drive.file` is sufficient. Per-file Picker-acquired scope already
 * permits both reading and mutating that file's permissions, so no auth
 * changes are needed for sharing.
 */

import type {Connection, Grant, GrantRequest, ResourceRef, Visibility} from '../types'
import {
  GrantFailedError,
  InsufficientPermissionError,
  NeedsReconnectError,
} from '../errors'


const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3'
const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403

const PERMISSION_FIELDS = 'id,type,role,emailAddress,domain'
const PERMISSION_LIST_FIELDS = `permissions(${PERMISSION_FIELDS})`


/**
 * Resolve a `ResourceRef` to the Drive fileId used by the Permissions API.
 * Drive treats files and folders identically here — both are `Files`
 * resources with a `permissions` collection — so we accept either.
 *
 * Throws `GrantFailedError` with cause `wrong_provider` if asked about a
 * GitHub-shaped resource; this is a programming error, not a runtime one.
 *
 * @return The Drive fileId for the resource.
 */
function resourceToFileId(connection: Connection, resource: ResourceRef): string {
  if (resource.kind === 'drive-file') {
    return resource.fileId
  }
  if (resource.kind === 'drive-folder') {
    return resource.folderId
  }
  throw new GrantFailedError(
    connection,
    'wrong_provider',
    `Drive provider cannot operate on resource kind '${resource.kind}'`,
  )
}


/**
 * Extract a Workspace-style domain from the connection's email metadata.
 * Returns null when the email is missing or shaped wrong, in which case
 * callers should refuse domain-scoped operations rather than guess.
 *
 * @return The domain (e.g. `'bldrs.ai'`), or null when unknowable.
 */
function workspaceDomain(connection: Connection): string | null {
  const email = connection.meta?.email
  if (typeof email !== 'string') {
    return null
  }
  const at = email.lastIndexOf('@')
  if (at < 0 || at === email.length - 1) {
    return null
  }
  return email.slice(at + 1)
}


/**
 * Wrap `fetch` with auth header, JSON encoding, and the typed-error
 * mapping shared by every sharing call. 401 maps to `NeedsReconnectError`
 * (token was revoked server-side after our cache said it was valid), 403
 * to `InsufficientPermissionError`, and any other non-2xx to
 * `GrantFailedError` with a `http_<status>` cause.
 *
 * 204 No Content (used by permission DELETE) is normal and not mapped.
 *
 * @return The raw `Response` on success.
 */
async function driveFetch(
  connection: Connection,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  token: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {Authorization: `Bearer ${token}`}
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(`${DRIVE_API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.ok) {
    return res
  }
  const text = await res.text().catch(() => '')
  if (res.status === HTTP_UNAUTHORIZED) {
    throw new NeedsReconnectError(
      connection,
      'token_invalid',
      `Drive API ${res.status}: ${text}`,
    )
  }
  if (res.status === HTTP_FORBIDDEN) {
    throw new InsufficientPermissionError(
      connection,
      'forbidden',
      `Drive API ${res.status}: ${text}`,
    )
  }
  throw new GrantFailedError(
    connection,
    `http_${res.status}`,
    `Drive API ${res.status}: ${text}`,
  )
}


/**
 * Map a Drive `Permission` resource onto our provider-neutral `Grant`.
 *
 * Drive's `type` enum (`user|group|domain|anyone`) lines up with our
 * `principalType` 1:1, and Drive's `role` enum (`reader|commenter|writer|owner`)
 * matches our `role` enum directly. The `principalId` is the email for
 * user/group, the domain for domain, and undefined for anyone.
 *
 * @return The grant in provider-neutral shape.
 */
function permissionToGrant(p: DrivePermission): Grant {
  const principalType = p.type as GrantRequest['principalType']
  const role = p.role as GrantRequest['role']
  let principalId: string | undefined
  if (principalType === 'user' || principalType === 'group') {
    principalId = p.emailAddress
  } else if (principalType === 'domain') {
    principalId = p.domain
  }
  return {
    id: p.id,
    principalType,
    principalId,
    role,
    origin: 'drive',
  }
}


interface DrivePermission {
  id: string
  type: 'user' | 'group' | 'domain' | 'anyone'
  role: 'reader' | 'commenter' | 'writer' | 'owner' | 'organizer' | 'fileOrganizer'
  emailAddress?: string
  domain?: string
}


/**
 * List grants on a Drive file or folder.
 *
 * Calls `permissions.list` with `supportsAllDrives` set so resources on
 * Shared Drives are reachable. The `fields` mask narrows the response to
 * the columns we use; without it the API returns more than we need.
 *
 * @return One grant per permission on the resource.
 */
export async function driveListGrants(
  connection: Connection,
  resource: ResourceRef,
  token: string,
): Promise<Grant[]> {
  const fileId = resourceToFileId(connection, resource)
  const params = new URLSearchParams({
    fields: PERMISSION_LIST_FIELDS,
    supportsAllDrives: 'true',
  })
  const res = await driveFetch(
    connection,
    'GET',
    `/files/${encodeURIComponent(fileId)}/permissions?${params}`,
    token,
  )
  const data = await res.json() as {permissions?: DrivePermission[]}
  return (data.permissions || []).map(permissionToGrant)
}


/**
 * Add a grant. Maps `GrantRequest` onto Drive's `permissions.create` body,
 * including the principal-shape mapping (`emailAddress` for user/group,
 * `domain` for domain, neither for anyone) and notification flags.
 *
 * Drive defaults `sendNotificationEmail` to true for user/group grants;
 * we forward `notify` explicitly so callers control the surface. `message`
 * is forwarded only when notify is on, matching the API.
 *
 * @return The created grant, including the Drive-assigned id.
 */
export async function driveShareWith(
  connection: Connection,
  resource: ResourceRef,
  grant: GrantRequest,
  token: string,
): Promise<Grant> {
  const fileId = resourceToFileId(connection, resource)

  const body: Record<string, unknown> = {
    type: grant.principalType,
    role: grant.role,
  }
  if (grant.principalType === 'user' || grant.principalType === 'group') {
    if (!grant.principalId) {
      throw new GrantFailedError(
        connection,
        'principal_required',
        `${grant.principalType} grant requires an email principalId`,
      )
    }
    body.emailAddress = grant.principalId
  } else if (grant.principalType === 'domain') {
    if (!grant.principalId) {
      throw new GrantFailedError(
        connection,
        'principal_required',
        'domain grant requires a domain principalId',
      )
    }
    body.domain = grant.principalId
  }

  const params = new URLSearchParams({
    fields: PERMISSION_FIELDS,
    supportsAllDrives: 'true',
  })
  // Drive only honors sendNotificationEmail for user/group grants; the API
  // rejects the param for domain/anyone. Forward only when meaningful.
  if (grant.principalType === 'user' || grant.principalType === 'group') {
    params.set('sendNotificationEmail', String(grant.notify ?? true))
    if (grant.notify !== false && grant.message) {
      params.set('emailMessage', grant.message)
    }
  }

  const res = await driveFetch(
    connection,
    'POST',
    `/files/${encodeURIComponent(fileId)}/permissions?${params}`,
    token,
    body,
  )
  const created = await res.json() as DrivePermission
  return permissionToGrant(created)
}


/** Remove a grant by its Drive permission id. */
export async function driveRevokeGrant(
  connection: Connection,
  resource: ResourceRef,
  grantId: string,
  token: string,
): Promise<void> {
  const fileId = resourceToFileId(connection, resource)
  const params = new URLSearchParams({supportsAllDrives: 'true'})
  await driveFetch(
    connection,
    'DELETE',
    `/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(grantId)}?${params}`,
    token,
  )
}


/**
 * Derive effective visibility from the resource's permission list.
 *
 * The Drive API does not expose a single "visibility" field, so we reduce:
 *   - any `anyone` permission     → `'public'`
 *   - any `domain` permission     → `'org'` *only when* the domain matches
 *                                   the acting connection's email domain
 *   - any `domain` permission but
 *     domain is unknowable        → `null` (honest answer: can't tell)
 *   - otherwise                   → `'private'`
 *
 * `'public'` wins over `'org'` when both apply: a public-link resource is
 * effectively public regardless of additional domain grants.
 *
 * @return The visibility, or null when not knowable from the API.
 */
export async function driveGetVisibility(
  connection: Connection,
  resource: ResourceRef,
  token: string,
): Promise<Visibility | null> {
  const grants = await driveListGrants(connection, resource, token)
  if (grants.some((g) => g.principalType === 'anyone')) {
    return 'public'
  }
  const domainGrants = grants.filter((g) => g.principalType === 'domain')
  if (domainGrants.length === 0) {
    return 'private'
  }
  const ownDomain = workspaceDomain(connection)
  if (!ownDomain) {
    return null
  }
  if (domainGrants.some((g) => g.principalId === ownDomain)) {
    return 'org'
  }
  // Domain permission exists but for a different workspace — from this
  // connection's vantage it's not visible to "my org," so report private.
  return 'private'
}


/**
 * Apply a target visibility, idempotently. Reads current state first so a
 * no-op call (already public, set to public) doesn't create a duplicate
 * permission. `'private'` removes every `anyone` and matching-domain
 * grant; user/group grants are deliberately preserved (a "private" resource
 * can still be shared with named collaborators).
 *
 * Throws `GrantFailedError` with cause `domain_unknown` when asked to set
 * `'org'` but the connection has no email metadata to derive the domain
 * from. Callers (a future Share dialog) should prompt for the domain in
 * that case.
 */
export async function driveSetVisibility(
  connection: Connection,
  resource: ResourceRef,
  visibility: Visibility,
  token: string,
): Promise<void> {
  const current = await driveListGrants(connection, resource, token)

  if (visibility === 'public') {
    if (!current.some((g) => g.principalType === 'anyone')) {
      await driveShareWith(
        connection,
        resource,
        {principalType: 'anyone', role: 'reader', notify: false},
        token,
      )
    }
    return
  }

  if (visibility === 'org') {
    const domain = workspaceDomain(connection)
    if (!domain) {
      throw new GrantFailedError(
        connection,
        'domain_unknown',
        'Cannot set org visibility: connection has no email to derive a domain from',
      )
    }
    if (!current.some(
      (g) => g.principalType === 'domain' && g.principalId === domain,
    )) {
      await driveShareWith(
        connection,
        resource,
        {principalType: 'domain', principalId: domain, role: 'reader', notify: false},
        token,
      )
    }
    return
  }

  // 'private': drop link-share and matching-domain grants.
  const ownDomain = workspaceDomain(connection)
  for (const g of current) {
    if (g.principalType === 'anyone') {
      await driveRevokeGrant(connection, resource, g.id, token)
    } else if (g.principalType === 'domain' && (!ownDomain || g.principalId === ownDomain)) {
      // Without an own-domain we can't tell which domain grant is "ours";
      // remove all domain grants on this resource so visibility actually
      // collapses. This matches Drive's UI behavior on "restrict to specific
      // people" with no domain anchor.
      await driveRevokeGrant(connection, resource, g.id, token)
    }
  }
}
