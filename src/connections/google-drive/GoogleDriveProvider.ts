/**
 * Google Drive ConnectionProvider implementation.
 *
 * Uses Google Identity Services (GIS) for OAuth token acquisition,
 * separate from Auth0 (which is scoped to the GitHub API audience).
 *
 * Tokens are held in memory only and re-obtained via GIS on page reload.
 */

import type {Connection, ConnectionProvider, ConnectionStatus} from '../types'
import debug from '../../utils/debug'
import {loadGisScript} from './loadGisScript'
import type {TokenResponse} from './loadGisScript'


const CONNECT_TIMEOUT_MS = 120_000
const DEFAULT_TOKEN_EXPIRES_S = 3600
const MS_PER_S = 1000
const EMAIL_FETCH_TIMEOUT_MS = 5000
const POPUP_CLOSE_DEBOUNCE_MS = 2000

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

interface CachedToken {
  token: string
  expiresAt: number
}

/** In-memory token store keyed by connection ID. Never persisted. */
const tokenCache = new Map<string, CachedToken>()

let idCounter = 0

/** @return A unique connection ID */
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

    debug().log('[GDrive] Starting connect, clientId:', `${clientId.substring(0, 8)}...`)

    return new Promise<Connection>((resolve, reject) => {
      let settled = false
      let gotCallback = false

      // Safety timeout — never let the promise hang forever
      const overallTimeout = setTimeout(() => {
        if (!settled) {
          settled = true
          console.error('[GDrive] Connect timed out after 120s. gotCallback:', gotCallback)
          reject(new Error('Google Drive connection timed out. Please check your GCP OAuth settings and try again.'))
        }
      }, CONNECT_TIMEOUT_MS)

      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true
          clearTimeout(overallTimeout)
          fn()
        }
      }

      const makeConnection = (connectionId: string, email?: string | null): Connection => ({
        id: connectionId,
        providerId: 'google-drive',
        label: email ? `${email} - GDrive` : 'GDrive',
        status: 'connected',
        auth0Connection: 'google-oauth2',
        createdAt: new Date().toISOString(),
        lastRefreshedAt: new Date().toISOString(),
        meta: email ? {email} : {},
      })

      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (response: TokenResponse) => {
          gotCallback = true
          debug().log('[GDrive] OAuth callback received, error:', response.error || 'none')

          if (response.error) {
            settle(() => reject(new Error(
              `Google OAuth error: ${response.error} - ${response.error_description || ''}`,
            )))
            return
          }

          debug().log('[GDrive] Token received, expires_in:', response.expires_in)
          const connectionId = generateId()
          const expiresInMs = (response.expires_in || DEFAULT_TOKEN_EXPIRES_S) * MS_PER_S

          tokenCache.set(connectionId, {
            token: response.access_token,
            expiresAt: Date.now() + expiresInMs,
          })

          // Fetch user email with a 5s timeout — don't let it block connection
          const emailPromise = Promise.race([
            fetchUserEmail(response.access_token),
            new Promise<null>((r) => setTimeout(() => r(null), EMAIL_FETCH_TIMEOUT_MS)),
          ])

          emailPromise
            .then((email) => {
              debug().log('[GDrive] User email:', email || 'unknown')
              settle(() => resolve(makeConnection(connectionId, email)))
            })
            .catch((err) => {
              console.error('[GDrive] fetchUserEmail failed:', err)
              settle(() => resolve(makeConnection(connectionId)))
            })
        },
        error_callback: (error) => {
          debug().log('[GDrive] error_callback:', error.type, error.message, 'gotCallback:', gotCallback)

          // popup_closed fires when the popup window closes. If we already
          // got a successful callback, ignore it. If not, wait briefly to
          // see if the callback arrives (GIS sometimes fires this first).
          if (error.type === 'popup_closed') {
            setTimeout(() => {
              if (!settled && !gotCallback) {
                settle(() => reject(new Error('Google sign-in was cancelled')))
              }
            }, POPUP_CLOSE_DEBOUNCE_MS)
            return
          }
          settle(() => reject(new Error(`Google OAuth error: ${error.type} - ${error.message}`)))
        },
      })

      debug().log('[GDrive] Calling requestAccessToken...')
      client.requestAccessToken()
    })
  },

  async disconnect(connectionId: string): Promise<void> {
    const cached = tokenCache.get(connectionId)
    if (cached) {
      try {
        await loadGisScript()
        google.accounts.oauth2.revoke(cached.token, () => undefined)
      } catch {
        // Revocation failure is non-critical
      }
      tokenCache.delete(connectionId)
    }
  },

  checkStatus(connection: Connection): Promise<ConnectionStatus> {
    const cached = tokenCache.get(connection.id)
    if (!cached) {
      return Promise.resolve('disconnected')
    }
    if (Date.now() >= cached.expiresAt) {
      return Promise.resolve('expired')
    }
    return Promise.resolve('connected')
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
      let settled = false

      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        hint: (connection.meta.email as string) || undefined,
        callback: (response: TokenResponse) => {
          if (response.error) {
            if (!settled) {
              settled = true
              reject(new Error(`Google OAuth refresh error: ${response.error}`))
            }
            return
          }

          const expiresInMs = (response.expires_in || DEFAULT_TOKEN_EXPIRES_S) * MS_PER_S
          tokenCache.set(connection.id, {
            token: response.access_token,
            expiresAt: Date.now() + expiresInMs,
          })

          if (!settled) {
            settled = true
            resolve(response.access_token)
          }
        },
        error_callback: (error) => {
          if (error.type === 'popup_closed') {
            return
          }
          if (!settled) {
            settled = true
            reject(new Error(`Google OAuth refresh error: ${error.type} - ${error.message}`))
          }
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
