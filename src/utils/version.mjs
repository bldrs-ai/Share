import {execSync} from 'child_process'
import fs from 'fs'


/**
 * This is a script meant to be used as a command-line tool by the
 * build tool in package.json.  It reads package.json, and updates the
 * version information using git's version.
 *
 * > yarn build
 * ...
 *  node --experimental-json-modules src/utils/version.mjs > package.json.new && mv package.json.new package.json
 * ...
 */

const rawFileData = fs.readFileSync('package.json')
const pkgJson = JSON.parse(rawFileData)

// https://stackoverflow.com/questions/24663175/how-can-i-inject-a-build-number-with-webpack
const __versionString__ = execSync('git rev-list HEAD --count').toString().trim()
const version = pkgJson.version.toString().replace(/-.*/, '')
pkgJson.version = `${version}-r${__versionString__}`
const pkgJsonStr = JSON.stringify(pkgJson, null, '  ')

// Outputs to console for capture by file redirect in the calling script.
console.log(pkgJsonStr) // eslint-disable-line no-console
