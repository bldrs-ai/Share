import {execFileSync} from 'node:child_process'
import {cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {gunzipSync} from 'node:zlib'


/**
 * Publish a small, self-contained Git repository for the homepage model. Serve
 * the model blobs at ordinary static URLs too, so Share's normal IFC loader can
 * open a permalink without loading the Git client or the history first.
 *
 * @param {string} buildDir Directory containing the copied public assets
 */
export function buildHomepageVersions(buildDir) {
  const repository = mkdtempSync(join(tmpdir(), 'share-homepage-git-'))
  const output = join(buildDir, 'homepage-versions')
  const gitdir = join(repository, '.git')
  const demoGit = (args, options = {}) => execFileSync(
    'git', ['-C', repository, ...args], options,
  )
  try {
    demoGit(['init', '--quiet', '--template=', '--object-format=sha1', '--initial-branch=main'])
    const snapshots = [
      ['main', 'original.ifc.gz', 'Original homepage model', '2023-11-01T00:00:00Z'],
      ['dev', 'building-b.ifc.gz', 'Preview the redesigned B building', '2023-11-02T00:00:00Z'],
    ]

    let parent
    for (const [branch, filename, message, date] of snapshots) {
      const model = gunzipSync(readFileSync(new URL(filename, import.meta.url)))
      if (branch === 'main' && !model.equals(readFileSync(join(buildDir, 'index.ifc')))) {
        throw new Error('The homepage IFC must match the live Git snapshot')
      }
      const blob = demoGit(['hash-object', '-w', '--stdin'], {input: model}).toString().trim()
      const tree = demoGit(['mktree'], {input: `100644 blob ${blob}\tindex.ifc\n`}).toString().trim()
      const sha = demoGit(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message], {
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Bldrs',
          GIT_AUTHOR_EMAIL: 'info@bldrs.ai',
          GIT_AUTHOR_DATE: date,
          GIT_COMMITTER_NAME: 'Bldrs',
          GIT_COMMITTER_EMAIL: 'info@bldrs.ai',
          GIT_COMMITTER_DATE: date,
        },
      }).toString().trim()
      demoGit(['update-ref', `refs/heads/${branch}`, sha])
      const revisionDir = join(output, sha)
      mkdirSync(revisionDir, {recursive: true})
      writeFileSync(join(revisionDir, 'index.ifc'), model)
      parent = sha
    }
    // Copy only the public fixture's Git data. No app repo config or refs.
    const gitOutput = join(output, 'repository')
    mkdirSync(gitOutput, {recursive: true})
    for (const name of ['HEAD', 'refs', 'objects']) {
      cpSync(join(gitdir, name), join(gitOutput, name), {recursive: true})
    }
  } finally {
    rmSync(repository, {recursive: true, force: true})
  }
}
