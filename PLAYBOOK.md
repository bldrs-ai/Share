# Playbook

This doc describes how to work in the project as a developer and in our team.

## Development Commands

### Build Commands
- `yarn build` / `yarn build-conway` - Main production build using Conway engine
- `yarn build-webifc` - Build using web-ifc instead of Conway
- `yarn build-cosmos` - Build React Cosmos component library documentation
- `yarn build-share-analyze` - Build with bundle analysis enabled
- `yarn clean` - Remove build artifacts in `docs/` directory

### Development Server
- `yarn serve` - Start development server with hot reload (default: Conway, HTTP)
- `yarn serve-https` - Start development server with HTTPS
- `yarn serve-cosmos` - Start React Cosmos component development environment
- Environment variables: `SHARE_CONFIG=dev|prod`, `serveHttps=true|false`

### Testing
- `yarn test` - Run all tests (src and tools)
- `yarn test-src` - Run source code tests with Jest
- `yarn test-tools` - Run build tool tests
- `yarn lint` - Run ESLint and TypeScript type checking
- `yarn typecheck` - Run TypeScript type checking only
- `yarn precommit` - Run lint and test (pre-commit hook)

### Cypress E2E Testing
- `yarn cy` - Run Cypress tests headlessly in Chrome
- `yarn cy-headed` - Run Cypress tests with UI
- `yarn cy-spec` - Run specific test spec
- `yarn cy-build` - Build for Cypress testing with MSW enabled
- `yarn cy-parallel` - Run tests in parallel for faster execution
- `yarn cy-percy` - Run visual regression tests with Percy

## Testing OPFS Worker Code

`OPFS.worker.js` runs in a Web Worker and uses browser-only globals. Tests for it require the
node environment and manual polyfills. See `src/OPFS/OPFS.worker.test.js` for the full setup,
key points:
- Use `/** @jest-environment node */` at the top of the file
- Declare `global.self`, `global.CacheModule`, `global.importScripts` before `require`ing the worker
- Polyfill `File`, `DOMException`, `WritableStream` if needed
- `require('./OPFS.worker.js')` returns the worker's exported functions for direct testing

To simulate the worker sending multiple messages in `utils.test.js`, call the listener multiple
times inside one `process.nextTick`:
```js
const mockWorker = {
  addEventListener: jest.fn((_, handler) => {
    process.nextTick(() => {
      handler({data: {completed: true, event: 'download', file: mockFile}})
      handler({data: {completed: true, event: 'renamed', file: mockFile, lastModifiedGithub: 123}})
    })
  }),
  removeEventListener: jest.fn(),
}
```

## Debugging Silent No-ops in Persistence

`updateRecentFileLastModified(id, ms)` and similar persistence helpers are **silent no-ops** when
no entry matches the `id`. If an update appears not to be working, verify:

1. The entry was created (via `addRecentFileEntry`) before the update runs
2. The `id` at creation and update sites are byte-for-byte identical

For GitHub files the id is the share path built by `navigateBaseOnModelPath`. A common mistake
is passing `filepath` without a leading `/` — this fuses the branch and filename with no separator
and the lookup silently fails. See DESIGN.md for the `filepath` format contract.

## Test Fixture Data Should Match Production Shape

When writing test fixtures for route-derived data (e.g. `modelPath`), use the exact shape that the
production code produces — not a "nicer" variant. The routes layer strips leading slashes from
`filepath` via `splitAroundExtensionRemoveFirstSlash`. A fixture with `filepath: '/model.ifc'`
accidentally passes tests that would fail with the real `filepath: 'model.ifc'`, masking bugs.
