import debug from './debug'


/**
 * @return {boolean} True if running locally
 */
export function isRunningLocally() {
  const local = window.location.hostname == 'localhost' ||
    window.location.hostname.startsWith('127.') ||
        window.location.hostname.startsWith('192.')
  if (local) {
    debug().warn('Network: site is being served locally')
    return true
  }
  return false
}
