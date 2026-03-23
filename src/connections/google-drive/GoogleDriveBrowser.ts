/**
 * Google Drive SourceBrowser implementation.
 *
 * Uses the Google Drive REST API v3 for listing files and folders,
 * and for generating download URLs.
 */

import type {
  Connection,
  Source,
  SourceBrowser,
  SourceLocation,
  FileListResult,
  FileDownloadResult,
  SourceFile,
  SourceFolder,
  GoogleDriveLocation,
} from '../types'
import {googleDriveProvider} from './GoogleDriveProvider'


const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3'

/** MIME type for Google Drive folders */
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'

/** Fields to request for each file in a listing */
const FILE_FIELDS = 'nextPageToken,files(id,name,mimeType,size,modifiedTime,thumbnailLink,fileExtension)'


export const googleDriveBrowser: SourceBrowser = {
  providerId: 'google-drive',

  pickLocation(_connection: Connection): Promise<SourceLocation | null> {
    // Location picking is handled by the GoogleDrivePickerDialog React component.
    // This method exists to satisfy the interface; UI-driven picking is preferred.
    throw new Error(
      'Use the GoogleDrivePickerDialog component for interactive folder selection.',
    )
  },

  async listFiles(
    connection: Connection,
    source: Source,
    path?: string,
    pageToken?: string,
  ): Promise<FileListResult> {
    const token = await googleDriveProvider.getAccessToken(connection)
    const location = source.location as GoogleDriveLocation
    const folderId = path || location.folderId

    const query = `'${folderId}' in parents and trashed = false`
    const params = new URLSearchParams({
      q: query,
      fields: FILE_FIELDS,
      pageSize: '100',
      orderBy: 'folder,name',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    })

    if (pageToken) {
      params.set('pageToken', pageToken)
    }

    // If source is on a Shared Drive, include the driveId
    if (location.driveId) {
      params.set('driveId', location.driveId)
      params.set('corpora', 'drive')
    }

    const response = await fetch(`${DRIVE_API_BASE}/files?${params}`, {
      headers: {Authorization: `Bearer ${token}`},
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Google Drive API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()

    const files: SourceFile[] = []
    const folders: SourceFolder[] = []

    for (const item of data.files || []) {
      if (item.mimeType === FOLDER_MIME_TYPE) {
        folders.push({
          id: item.id,
          name: item.name,
        })
      } else {
        files.push({
          id: item.id,
          name: item.name,
          mimeType: item.mimeType,
          size: item.size ? Number(item.size) : undefined,
          modifiedAt: item.modifiedTime,
          thumbnailUrl: item.thumbnailLink,
          meta: item.fileExtension ? {fileExtension: item.fileExtension} : undefined,
        })
      }
    }

    return {
      files,
      folders,
      nextPageToken: data.nextPageToken,
    }
  },

  async getFileDownload(
    connection: Connection,
    _source: Source,
    fileId: string,
  ): Promise<FileDownloadResult> {
    const token = await googleDriveProvider.getAccessToken(connection)

    // Fetch file metadata for filename and MIME type
    const metaParams = new URLSearchParams({
      fields: 'name,mimeType',
      supportsAllDrives: 'true',
    })

    const metaResponse = await fetch(
      `${DRIVE_API_BASE}/files/${fileId}?${metaParams}`,
      {headers: {Authorization: `Bearer ${token}`}},
    )

    if (!metaResponse.ok) {
      throw new Error(`Failed to fetch file metadata: ${metaResponse.status}`)
    }

    const meta = await metaResponse.json()

    // Download the file content as a blob (OAuth-authenticated)
    const downloadResponse = await fetch(
      `${DRIVE_API_BASE}/files/${fileId}?alt=media&supportsAllDrives=true`,
      {headers: {Authorization: `Bearer ${token}`}},
    )

    if (!downloadResponse.ok) {
      throw new Error(`Failed to download file: ${downloadResponse.status}`)
    }

    const blob = await downloadResponse.blob()

    return {
      blob,
      filename: meta.name,
      mimeType: meta.mimeType,
    }
  },
}
