const createBundler = require('@bahmutov/cypress-esbuild-preprocessor')


module.exports = (on, config) => {
  const bundler = createBundler({
  })

  on('file:preprocessor', bundler)
}
