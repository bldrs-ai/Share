/**
 * Dynamic `import()` behind a one-line module of its own.
 *
 * Two reasons it is not inlined in `proModuleLoader.js`:
 *  - Jest. Babel's CJS interop rewrites `import()` to `require()`, which
 *    cannot load a `blob:` URL at all, so every loader test would fail on
 *    the transform rather than on the code under test. A separate module is
 *    `jest.mock`-able; a same-module helper is not (babel binds internal
 *    call sites to the local function, not to the exports object, so
 *    `jest.spyOn` on the namespace never intercepts).
 *  - The specifier is a runtime value, so bundlers must leave the import
 *    alone. Keeping it in one file makes that requirement visible.
 *
 * @param {string} url Usually a `blob:` URL holding module text
 * @return {Promise<object>} the module namespace
 */
export function importModuleFromUrl(url) {
  return import(url)
}
