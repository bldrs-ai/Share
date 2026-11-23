// The assistant's GFM plugin (tables, strikethrough, task lists), as its own
// entry of the main build: `docs/Components/Bot/remarkGfmEntry.js`, loaded
// by `markdownGfm.js` the first time a reply is shown. remark-gfm and its
// micromark/mdast parts cost ~10 KB gz, and the panel is behind a flag, so
// the viewer's cold load must not pay them (tools/esbuild/assistEntry.js).
// It imports no React, so this entry carries no second copy of it.
export {default} from 'remark-gfm'
