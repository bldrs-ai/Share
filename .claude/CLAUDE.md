# Share Project Guidelines

## Git Workflow
- Always create feature branches before major work: `feature/<name>`
- Keep main branch clean; merge via pull requests
- Commit messages: concise, imperative ("Add feature", "Fix bug")

## Architecture
- **State management**: Zustand with slice pattern (`src/store/*Slice.js`)
- **Components**: React functional components, MUI for UI
- **Auth**: Auth0 via `src/Auth0/Auth0Proxy.js`, `useAuth0()` hook
- **Privacy/cookies**: `js-cookie` + `src/privacy/Expires.js` (365-day expiry)
- **Navigation**: `navigateToModel()` does full page reload; `navWith()` for SPA nav
- **Dialogs**: Extend `src/Components/Dialog.jsx` base component

## Testing
- `yarn test` for unit tests (Jest + React Testing Library)
- `yarn build` for production build verification

## Key Patterns
- Store slices: export default function `create*Slice(set, get)` returning state + setters
- New UI dialogs: visibility controlled via Zustand store state
- Rate limiting: client-side via `src/privacy/usageTracking.js` (localStorage + cookie backup)
