# Spec: Codebase Improvements (Backlog)

## Overview
15 pre-existing issues found during memory leak audit. Not yet fixed.

## Critical: Security
1. **`document.write()` XSS** — `ProfileControl.jsx:153` writes fetch response directly to DOM
2. **API key in localStorage** — `BotChat.jsx:34,74` stores OpenRouter key unencrypted

## High: Remaining Memory Leaks
3. **iframe `load` listener** not cleaned up — `AppIFrame.jsx:28`
4. **Timer not cleared on unmount** — `SaveModelControl.jsx:372-383`
5. **Module-level shared state** — `CadView.jsx:32-33` (`count`, `previousThemeChangeCb`)
6. **File input listener leak** — `loader.js:85-87`

## High: React Anti-Patterns
7. **Missing useEffect deps** — `CadView.jsx:614-629` (stale closures)
8. **Missing useEffect deps** — `NotesControl.jsx:96-97, 232-233, 240-241`
9. **Unhandled async in useEffect** — `SaveModelControl.jsx:36-49`

## Medium: Code Quality
10. **`document.wheeling`** non-standard property — `CameraControl.jsx:69-73`
11. **Duplicate viewport meta tags** — `public/index.html:7, 9-10`
12. **Missing callback memoization** — `BotChat.jsx:77-96`
13. **Inefficient array ops** — `NotesControl.jsx:68-84` (reverse + flatMap with side effects)

## Low: Deprecated
14. **Auth0 logout pattern** — `ProfileControl.jsx:112-119`
15. **Unused variables** — `NoteContent.jsx:19`, `NoteCard.jsx:300`
