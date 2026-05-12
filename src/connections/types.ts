/**
 * Connections + Sources Framework
 *
 * Two-level architecture:
 *   Connection - Auth-level binding to an external service (e.g. Google account)
 *   Source     - Specific browsable storage location within a Connection (e.g. a Drive folder)
 */


// -- Provider IDs --

/** Identifies a provider type. Extend this union for new providers. */
export type ProviderId = 'google-drive' | 'github' | 'onedrive' | 'dropbox' | 'local'


// -- Connection --

export type ConnectionStatus = 'connected' | 'disconnected' | 'expired' | 'error'

/** A Connection represents an authenticated binding to an external service. */
export interface Connection {
  /** Unique identifier (uuid) */
  id: string
  /** Which provider this connection is for */
  providerId: ProviderId
  /** User-visible label, e.g. "Google Drive (russell@gmail.com)" */
  label: string
  /** Current auth status */
  status: ConnectionStatus
  /** Auth0 identity provider string if applicable, e.g. 'google-oauth2' */
  auth0Connection?: string
  /** ISO timestamp of creation */
  createdAt: string
  /** ISO timestamp of last credential refresh */
  lastRefreshedAt?: string
  /** Provider-specific metadata (email, avatar URL, etc.) */
  meta: Record<string, unknown>
}


// -- Source --

/** A Source represents a specific browsable storage location within a Connection. */
export interface Source {
  /** Unique identifier (uuid) */
  id: string
  /** Parent Connection ID */
  connectionId: string
  /** Which provider this source belongs to */
  providerId: ProviderId
  /** User-visible name, e.g. "Project Models" */
  label: string
  /** Provider-specific location data (discriminated union) */
  location: SourceLocation
  /** ISO timestamp of creation */
  createdAt: string
  /** ISO timestamp of last access */
  lastAccessedAt?: string
}


// -- Source Locations (discriminated union) --

export type SourceLocation = GoogleDriveLocation | GitHubLocation | GenericLocation

export interface GoogleDriveLocation {
  type: 'google-drive'
  folderId: string
  folderName: string
  /** Shared Drive ID, if applicable */
  driveId?: string
  /** Shared Drive name, if applicable */
  driveName?: string
}

export interface GitHubLocation {
  type: 'github'
  org: string
  repo: string
  branch: string
  /** Optional subfolder path */
  path?: string
}

export interface GenericLocation {
  type: string
  [key: string]: unknown
}


// -- Provider Interface --

/** Each provider implements this to plug into the Connections framework. */
export interface ConnectionProvider {
  /** Unique provider identifier */
  id: ProviderId
  /** Display name shown in UI */
  name: string
  /** Icon identifier or path */
  icon: string

  /**
   * Initiate the connection flow (OAuth popup, etc.). Returns the new Connection.
   *
   * @param hint - Optional login hint (typically email) to pre-select an account
   *   and skip the provider's account chooser when the user is already signed in.
   */
  connect(hint?: string): Promise<Connection>

  /** Disconnect and revoke credentials for a connection. */
  disconnect(connectionId: string): Promise<void>

  /** Check if a connection's credentials are still valid. */
  checkStatus(connection: Connection): Promise<ConnectionStatus>

  /** Get a valid access token for API calls. May silently refresh if expired. */
  getAccessToken(connection: Connection): Promise<string>

  // -- Sharing capability (optional) --
  // Implementations should declare any subset they can support and leave the
  // rest undefined. Callers must check for presence; see
  // `design/new/multi-user-sharing.md` for the rationale and error vocabulary.

  /**
   * List existing grants on a resource. Order is provider-defined.
   *
   * Throws `InsufficientPermissionError` when the connection lacks the right
   * to enumerate grants on the resource, `NeedsReconnectError` on stale
   * tokens, and `GrantFailedError` for any other transport/server failure.
   */
  listGrants?(connection: Connection, resource: ResourceRef): Promise<Grant[]>

  /**
   * Add a grant. The principal shape is provider-specific (email/domain for
   * Drive, login/team-slug for GitHub); see `GrantRequest` for details.
   *
   * @return The created grant, including its provider-assigned id.
   */
  shareWith?(
    connection: Connection,
    resource: ResourceRef,
    grant: GrantRequest,
  ): Promise<Grant>

  /** Remove a grant by its provider-assigned id. */
  revokeGrant?(
    connection: Connection,
    resource: ResourceRef,
    grantId: string,
  ): Promise<void>

  /**
   * Read the resource's effective visibility.
   *
   * Returns `null` when the underlying API doesn't expose a single
   * deterministic answer (e.g. a Drive resource with no public/domain
   * permissions and no clear "private" indicator). Treat `null` as
   * "unknown — show no chip" rather than as `'private'`.
   */
  getVisibility?(
    connection: Connection,
    resource: ResourceRef,
  ): Promise<Visibility | null>

  /**
   * Owner-only: change the resource's visibility. Idempotent — calling with
   * the current visibility is a no-op. Implementations may surface a
   * confirmation requirement at the UI layer; this method does not prompt.
   */
  setVisibility?(
    connection: Connection,
    resource: ResourceRef,
    visibility: Visibility,
  ): Promise<void>
}


// -- Sharing types --

/**
 * Effective visibility of a resource. The mapping is provider-specific:
 *   - Drive: `'public'` = "anyone with the link" permission present;
 *            `'org'`    = a `domain` permission matches the user's Workspace;
 *            `'private'` = neither.
 *   - GitHub: `'public'` = repo not private; `'private'` = repo private;
 *             `'org'`    = GitHub Enterprise `internal` (only when the
 *             owner is an org with `internal` available).
 */
export type Visibility = 'private' | 'org' | 'public'


/**
 * A resource a grant or visibility operation applies to. Discriminated by
 * `kind` so each provider can refuse shapes it doesn't own.
 *
 * `drive-folder.driveId` is set for items inside a Shared Drive (corpus).
 * `github-tree.path` is the optional sub-path inside a branch.
 */
export type ResourceRef =
  | {kind: 'drive-file'; fileId: string}
  | {kind: 'drive-folder'; folderId: string; driveId?: string}
  | {kind: 'github-repo'; org: string; repo: string}
  | {kind: 'github-tree'; org: string; repo: string; branch: string; path?: string}


/**
 * Who a grant applies to. The id shape depends on `principalType`:
 *
 *   - `'user'`   → email (Drive) or login (GitHub)
 *   - `'group'`  → group email (Drive) — GitHub uses `'user'` for teams below
 *   - `'domain'` → workspace domain, e.g. `'bldrs.ai'` (Drive only)
 *   - `'anyone'` → undefined; toggles link-share (Drive only)
 *
 * For GitHub, the team-vs-user distinction is encoded by the role/principal
 * pair the adapter chooses, not by an extra principal kind.
 */
export interface GrantRequest {
  principalType: 'user' | 'group' | 'domain' | 'anyone'
  principalId?: string
  role: 'reader' | 'commenter' | 'writer' | 'owner'
  /**
   * Send an email notification when the grant is created. Drive: default
   * true at the API; GitHub: always true and ignores the flag.
   */
  notify?: boolean
  /**
   * Custom message included in the notification. Drive only; ignored
   * elsewhere.
   */
  message?: string
}


/**
 * A grant as returned from the provider. `origin` records which system the
 * grant lives in: `'bldrs'` is reserved for the future sidecar-grant model
 * and is unused in PR1.
 */
export interface Grant {
  id: string
  principalType: GrantRequest['principalType']
  principalId?: string
  role: GrantRequest['role']
  origin: 'drive' | 'github' | 'bldrs'
}


// -- Source Browser Interface --

/** Each provider implements this for browsing and downloading files from a Source. */
export interface SourceBrowser {
  providerId: ProviderId

  /**
   * Open a picker/browser for the user to select a storage location.
   * Returns the selected location or null if cancelled.
   */
  pickLocation(connection: Connection): Promise<SourceLocation | null>

  /**
   * List files and folders in a source location.
   *
   * @param connection - The parent Connection (for auth)
   * @param source - The Source to browse
   * @param path - Optional subfolder ID/path within the source
   * @param pageToken - Optional pagination token
   */
  listFiles(
    connection: Connection,
    source: Source,
    path?: string,
    pageToken?: string,
  ): Promise<FileListResult>

  /**
   * Get download information for a specific file.
   *
   * @param connection - The parent Connection (for auth)
   * @param source - The Source containing the file
   * @param fileId - Provider-specific file identifier
   */
  getFileDownload(
    connection: Connection,
    source: Source,
    fileId: string,
  ): Promise<FileDownloadResult>
}


// -- File Listing Types --

export interface FileListResult {
  files: SourceFile[]
  folders: SourceFolder[]
  nextPageToken?: string
}

export interface SourceFile {
  /** Provider-specific file ID */
  id: string
  /** Display name */
  name: string
  /** MIME type */
  mimeType?: string
  /** File size in bytes */
  size?: number
  /** ISO timestamp of last modification */
  modifiedAt?: string
  /** Thumbnail URL if available */
  thumbnailUrl?: string
  /** Provider-specific extra data */
  meta?: Record<string, unknown>
}

export interface SourceFolder {
  /** Provider-specific folder ID */
  id: string
  /** Display name */
  name: string
  /** Provider-specific extra data */
  meta?: Record<string, unknown>
}

export interface FileDownloadResult {
  /** Authenticated download URL (caller must add auth headers) */
  downloadUrl?: URL
  /** Pre-fetched file blob */
  blob?: Blob
  /** Filename for display and format detection */
  filename: string
  /** MIME type */
  mimeType?: string
  /** ISO timestamp of last modification */
  modifiedAt?: string
}
