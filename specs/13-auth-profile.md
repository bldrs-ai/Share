# Spec: Auth & Profile

## Overview
Auth0-based authentication with GitHub identity. User profile management including login/logout and account settings.

## Key Files
| File | Role |
|------|------|
| `src/Auth0/Auth0Proxy.js` | Auth0 React SDK proxy/wrapper |
| `src/Components/Auth/` | Auth UI components |
| `src/Components/Profile/ProfileControl.jsx` | Profile button, logout, manage profile |
| `src/Components/Profile/ManageProfile.jsx` | Profile management dialog |

## Behavior
- Auth0 handles OAuth flow (GitHub identity provider)
- `accessToken` stored in Zustand, used for GitHub API calls
- Profile control shows login/logout button
- Logout uses Auth0 redirect pattern (older `openUrl` callback)
- Manage profile fetches/updates user data via API

## Known Issues
- `document.write()` XSS risk in ProfileControl logout flow
- Deprecated Auth0 logout pattern (should use redirect-based API)
