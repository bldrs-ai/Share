# Codebase Improvement Areas

Audit performed on 2026-03-17. These are pre-existing issues unrelated to the memory leak fixes.

---

## Critical: Security

### 1. `document.write()` XSS Risk
- **File:** `src/Components/Profile/ProfileControl.jsx:153`
- **Problem:** Response HTML from a fetch call is written directly to the DOM using `document.write()`. If the response contains malicious scripts, they will execute in the user's browser context.
- **Fix:** Navigate to the URL directly or use `innerHTML` with a sanitization library (e.g. DOMPurify).

### 2. API Key Stored in Plain Text in localStorage
- **File:** `src/Components/Bot/BotChat.jsx:34, 74`
- **Problem:** The user's OpenRouter API key is stored unencrypted in `localStorage` under the key `openrouter_api_key`. Any XSS vulnerability in the app (including the `document.write` issue above) could exfiltrate this key.
- **Fix:** Use a more secure storage mechanism, or at minimum warn users about the risk. Consider using session-only storage or encrypting the value.

---

## High: Memory Leaks

### 3. Event Listener Not Cleaned Up on Unmount
- **File:** `src/Components/Apps/AppIFrame.jsx:28`
- **Problem:** A `load` event listener is added to the iframe element but never removed when the component unmounts.
- **Fix:** Return a cleanup function from the `useEffect` that calls `removeEventListener`.

### 4. Timer Not Cleared on Unmount
- **File:** `src/Components/Open/SaveModelControl.jsx:372-383`
- **Problem:** A module-level `snackTimeout` variable holds a `setTimeout` reference. If the component unmounts before the timeout fires, it will attempt to update state on an unmounted component.
- **Fix:** Use a ref for the timeout and clear it in a useEffect cleanup.

### 5. Module-Level Shared State
- **File:** `src/Containers/CadView.jsx:32-33`
- **Problem:** `count` and `previousThemeChangeCb` are declared at module scope. They persist across component instances and can cause stale references and accumulated theme listeners.
- **Fix:** Move these into component scope using refs.

### 6. File Input Listener Leak
- **File:** `src/utils/loader.js:85-87`
- **Problem:** A `change` event listener is added to a dynamically created file input, which is then immediately removed from the DOM. The listener may fire after removal or never be garbage collected cleanly.
- **Fix:** Remove the event listener explicitly after handling or before removing the element.

---

## High: React Anti-Patterns

### 7. Missing useEffect Dependencies (CadView)
- **File:** `src/Containers/CadView.jsx:614-629`
- **Problem:** ESLint exhaustive-deps rule is disabled. `hasGitHubIdentity` and `isViewerLoaded` are used inside the effect but missing from the dependency array, creating stale closures.
- **Fix:** Add missing dependencies or restructure to avoid the stale closure.

### 8. Missing useEffect Dependencies (NotesControl)
- **File:** `src/Components/Notes/NotesControl.jsx:96-97, 232-233, 240-241`
- **Problem:** Multiple `useEffect` hooks have suppressed exhaustive-deps warnings with significant missing dependencies including `accessToken`, `setNotes`, `toggleSynchSidebar`, and others.
- **Fix:** Audit each effect and add the correct dependencies.

### 9. Unhandled Async in useEffect
- **File:** `src/Components/Open/SaveModelControl.jsx:36-49`
- **Problem:** `fetchOrganizations()` is called inside a useEffect with no `.catch()` or try/catch. Network failures will result in unhandled promise rejections.
- **Fix:** Wrap in try/catch with appropriate error handling/user feedback.

---

## Medium: Code Quality

### 10. Non-Standard Document Property Mutation
- **File:** `src/Components/Camera/CameraControl.jsx:69-73`
- **Problem:** `document.wheeling` is used as a debounce timer store. This is not a standard DOM property and could conflict with other code or libraries.
- **Fix:** Use a React ref instead.

### 11. Duplicate Viewport Meta Tags
- **File:** `public/index.html:7, 9-10`
- **Problem:** Two `<meta name="viewport">` tags exist. This can cause unpredictable viewport behavior, especially on mobile browsers, and may contribute to the blank-page-on-mobile issue.
- **Fix:** Remove the duplicate and keep only one comprehensive viewport tag.

### 12. No Callback Memoization in BotChat
- **File:** `src/Components/Bot/BotChat.jsx:77-96`
- **Problem:** `handleSend` accesses store state and is recreated on every render without proper memoization of dependencies. Large message arrays will cause frequent re-renders.
- **Fix:** Ensure all dependencies are stable or memoized.

### 13. Inefficient Array Operations in NotesControl
- **File:** `src/Components/Notes/NotesControl.jsx:68-84`
- **Problem:** `.reverse().flatMap()` with side effects (push inside flatMap). This is both inefficient for large arrays and violates functional programming expectations.
- **Fix:** Use a simple loop instead of flatMap with side effects.

---

## Low: Deprecated Patterns

### 14. Deprecated Auth0 Logout Pattern
- **File:** `src/Components/Profile/ProfileControl.jsx:112-119`
- **Problem:** Uses the older Auth0 logout callback pattern with `openUrl`.
- **Fix:** Migrate to Auth0's current redirect-based logout API.

### 15. Unused Variables
- **Files:** `src/Components/Notes/NoteContent.jsx:19`, `src/Components/Notes/NoteCard.jsx:300`
- **Problem:** ESLint `no-unused-vars` rule is suppressed for variables that should be cleaned up.
- **Fix:** Remove unused variables.
