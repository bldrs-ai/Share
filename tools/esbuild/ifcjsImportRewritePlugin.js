import fs from 'fs'


// Fixup for this issue https://github.com/evanw/esbuild/issues/3121
const ifcjsImportRewritePlugin = {
  name: 'ifcjsImportRewrite',
  setup(build) {
    build.onLoad({filter: /openbim-components\/.*.js/}, (args) => {
      const contents = fixupJsSource(args.path)
      return {contents, loader: 'js'}
    })
    build.onLoad({filter: /openbim-clay\/.*.js/}, (args) => {
      const contents = fixupJsSource(args.path)
      return {contents, loader: 'js'}
    })
    build.onLoad({filter: /bim-fragment\/.*.js/}, (args) => {
      const contents = fixupJsSource(args.path)
      return {contents, loader: 'js'}
    })
  },
}


export default ifcjsImportRewritePlugin


/**
 * Append '.js' to IFCjs imports in js source.
 *
 * @param {string} path Source file to process
 * @return {string} Rewritten file content
 */
function fixupJsSource(path) {
  const contents = fs.readFileSync(path, 'utf8')
  const lines = contents.split('\n')
  let newContent = ''
  for (const line of lines) {
    if (line.startsWith('import') &&
        line.includes('"three/') &&
        !line.endsWith('.js";')) {
      const match = line.match(/^import(.*[\w])";/)
      if (match) {
        newContent += `import ${match[1]}.js";\n`
      } else {
        newContent += `${line}\n`
      }
    } else {
      newContent += `${line}\n`
    }
  }
  return newContent
}
