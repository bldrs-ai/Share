/**
 * @param {string} src
 * @return {string}
 */
export default {
  process: (src) => {
    // We simply wrap the raw text in a JS module export statement
    return {
      code: `module.exports = ${JSON.stringify(src)};`,
    }
  },
}
