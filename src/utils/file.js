/**
 * @param {string} filepath
 * @return {string}
 */
export function getNewModelRealPath(filepath) {
  const l = window.location
  filepath = filepath.split('.ifc')[0]
  const parts = filepath.split('/')
  filepath = parts[parts.length - 1]
  filepath = `blob:${l.protocol}//${l.hostname + (l.port ? `:${l.port}` : '')}/${filepath}`
  return filepath
}
