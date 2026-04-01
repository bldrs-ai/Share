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

  /** Initiate the connection flow (OAuth popup, etc.). Returns the new Connection. */
  connect(): Promise<Connection>

  /** Disconnect and revoke credentials for a connection. */
  disconnect(connectionId: string): Promise<void>

  /** Check if a connection's credentials are still valid. */
  checkStatus(connection: Connection): Promise<ConnectionStatus>

  /** Get a valid access token for API calls. May silently refresh if expired. */
  getAccessToken(connection: Connection): Promise<string>
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
