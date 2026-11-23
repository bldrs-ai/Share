import {importModuleFromUrl} from '../../export/importModuleFromUrl'


/**
 * Load the GFM plugin for assistant replies (remarkGfmEntry.js) on first use.
 * The URL is built at run time, beside this bundle's `index.js`, for the
 * reason assistRuntime.js gives: the build doesn't split, so a literal
 * `import()` would be inlined into the main bundle.
 *
 * @return {Promise<Function>} the `remark-gfm` plugin; rejects if it can't be fetched
 */
export function loadMarkdownGfm() {
  if (!gfm) {
    gfm = importModuleFromUrl(new URL('./Components/Bot/remarkGfmEntry.js', import.meta.url).href)
      .then((module) => module.default)
    // A failed fetch must not stick: the next reply retries.
    gfm.catch(() => {
      gfm = null
    })
  }
  return gfm
}


let gfm = null
