/**
 * @param {string} pathPrefix e.g. /share/v/p
 * @param {string} repoFilePath e.g. index.ifc OR org/repo/file.ifc with /share/v/gh OR uuid with pathPrefix=/share/v/new
 * @param {string} elementPath /1/2/3/4
 * @return {string}
 */
export function partsToPath(pathPrefix, repoFilePath, elementPath) {
  const trimSlashes = (str) => str.replace(/^\/+|\/+$/g, '')
  return `/${trimSlashes(pathPrefix)}/${trimSlashes(repoFilePath)}/${trimSlashes(elementPath)}`
}
