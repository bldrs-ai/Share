import debug from './debug'


/**
 * @return {boolean}
 */
export function isDevMode() {
  debug().log('common#isDevMode: process.env.NODE_ENV: ', process.env.NODE_ENV)
  return process.env.NODE_ENV === 'development'
}
