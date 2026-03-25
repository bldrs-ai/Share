# Spec: Apps (Plugin System)

## Overview
Iframe-based plugin system. External web apps run in sandboxed iframes and communicate with the viewer via MessageChannel (Widget API pattern).

## Key Files
| File | Role |
|------|------|
| `src/Components/Apps/AppsPanel.jsx` | App listing panel |
| `src/Components/Apps/AppsListing.jsx` | Renders available apps from registry |
| `src/Components/Apps/AppsRegistry.json` | Registered apps: name, URL, icon |
| `src/Components/Apps/AppIFrame.jsx` | Iframe host with MessageChannel setup |
| `src/Components/Apps/AppsMessagesHandler.js` | `IFrameCommunicationChannel` — bidirectional messaging |
| `src/Components/Apps/hashState.js` | URL state for active app |
| `src/WidgetApi/ApiConnection.js` | Abstract base for widget communication |
| `src/store/AppsSlice.js` | Zustand: apps state |
| `src/Containers/AppsSideDrawer.jsx` | Side drawer container for app iframe |

## Communication Protocol
- `MessageChannel` created per iframe instance
- Port 2 transferred to iframe via `postMessage`
- Port 1 used by host for bidirectional messaging
- Messages include operations like element selection, property queries
- `ApiConnection` base class provides `invalidOperationResponse()` and `missingArgumentResponse()`

## Lifecycle
1. User opens Apps panel → sees registered apps
2. Clicking an app opens it in a side drawer iframe
3. `IFrameCommunicationChannel` established on iframe load
4. App communicates via Widget API messages
5. On unmount: channel `dispose()` closes ports and releases references

## Known Apps
- Dashboard App (external iframe widget)

## State
```javascript
{
  isAppsVisible: boolean,
  selectedApp: null | object
}
```
