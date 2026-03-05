/**
 * Google Drive ConnectionProvider implementation.
 *
 * Uses Google Identity Services (GIS) for OAuth token acquisition,
 * separate from Auth0 (which is scoped to the GitHub API audience).
 *
 * Tokens are held in memory only and re-obtained via GIS on page reload.
 */

import type {Connection, ConnectionProvider, ConnectionStatus} from '../types'
import {loadGisScript} from './loadGisScript'
import type {TokenResponse} from './loadGisScript'


const SCOPES = 'https://www.googleapis.com/auth/drive.readonly'

interface CachedToken {
  token: string
  expiresAt: number
}

/** In-memory token store keyed by connection ID. Never persisted. */
const tokenCache = new Map<string, CachedToken>()

let idCounter = 0

function generateId(): string {
  idCounter += 1
  return `gdrive-${Date.now()}-${idCounter}`
}


export const googleDriveProvider: ConnectionProvider = {
  id: 'google-drive',
  name: 'Google Drive',
  icon: 'google-drive',

  async connect(): Promise<Connection> {
    await loadGisScript()

    const clientId = process.env.GOOGLE_OAUTH2_CLIENT_ID
    if (!clientId) {
      throw new Error('GOOGLE_OAUTH2_CLIENT_ID environment variable is not set')
    }

    return new Promise<Connection>((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (response: TokenResponse) => {
          if (response.error) {
            reject(new Error(`Google OAuth error: ${response.error} - ${response.error_description || ''}`))
            return
          }

          const connectionId = generateId()
          const expiresInMs = (response.expires_in || 3600) * 1000

          tokenCache.set(connectionId, {
            token: response.access_token,
            expiresAt: Date.now() + expiresInMs,
          })

          // Fetch user info to get email for the label
          fetchUserEmail(response.access_token).then((email) => {
            const connection: Connection = {
              id: connectionId,
              providerId: 'google-drive',
              label: email ? `Google Drive (${email})` : 'Google Drive',
              status: 'connected',
              auth0Connection: 'google-oauth2',
              createdAt: new Date().toISOString(),
              lastRefreshedAt: new Date().toISOString(),
              meta: email ? {email} : {},
            }
            resolve(connection)
          })
        },
        error_callback: (error) => {
          reject(new Error(`Google OAuth error: ${error.type} - ${error.message}`))
        },
      })

      client.requestAccessToken()
    })
  },

  async disconnect(connectionId: string): Promise<void> {
    const cached = tokenCache.get(connectionId)
    if (cached) {
      try {
        await loadGisScript()
        google.accounts.oauth2.revoke(cached.token, () => {})
      } catch {
        // Revocation failure is non-critical
      }
      tokenCache.delete(connectionId)
    }
  },

  async checkStatus(connection: Connection): Promise<ConnectionStatus> {
    const cached = tokenCache.get(connection.id)
    if (!cached) {
      return 'disconnected'
    }
    if (Date.now() >= cached.expiresAt) {
      return 'expired'
    }
    return 'connected'
  },

  async getAccessToken(connection: Connection): Promise<string> {
    const cached = tokenCache.get(connection.id)
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token
    }

    // Token expired or missing — re-trigger OAuth flow
    await loadGisScript()

    const clientId = process.env.GOOGLE_OAUTH2_CLIENT_ID
    if (!clientId) {
      throw new Error('GOOGLE_OAUTH2_CLIENT_ID environment variable is not set')
    }

    return new Promise<string>((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        hint: (connection.meta.email as string) || undefined,
        callback: (response: TokenResponse) => {
          if (response.error) {
            reject(new Error(`Google OAuth refresh error: ${response.error}`))
            return
          }

          const expiresInMs = (response.expires_in || 3600) * 1000
          tokenCache.set(connection.id, {
            token: response.access_token,
            expiresAt: Date.now() + expiresInMs,
          })

          resolve(response.access_token)
        },
        error_callback: (error) => {
          reject(new Error(`Google OAuth refresh error: ${error.type} - ${error.message}`))
        },
      })

      // Use empty string prompt to try silent refresh; will show popup if consent needed
      client.requestAccessToken({prompt: ''})
    })
  },
}


/** Fetch the authenticated user's email from Google's userinfo endpoint. */
async function fetchUserEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {Authorization: `Bearer ${accessToken}`},
    })
    if (!response.ok) {
      return null
    }
    const data = await response.json()
    return data.email || null
  } catch {
    return null
  }
}
