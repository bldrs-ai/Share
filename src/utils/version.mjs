import {execSync} from 'child_process'
import PkgInfo from '../../package.json' assert {type: "json"}

// https://stackoverflow.com/questions/24663175/how-can-i-inject-a-build-number-with-webpack
const __versionString__ = execSync('git rev-list HEAD --count').toString().trim()
const version = PkgInfo.version.toString().replace(/-.*/, '')

PkgInfo.version = `${version}-r${__versionString__}`
const PkgInfoStr = JSON.stringify(PkgInfo, null, '  ')

console.log(PkgInfoStr)
