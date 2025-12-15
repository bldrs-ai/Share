/**
 * @param {string} urlStr
 * @return {boolean}
 */
export function gdrivePrefix(urlStr) {
  return urlStr.startsWith('https://www.googleapis.com/drive/v3/files/')
}
