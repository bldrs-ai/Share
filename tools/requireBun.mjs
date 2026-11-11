#!/usr/bin/env node
// `preinstall` guard: this repo installs with Bun (bun.lock, bunfig.toml's
// isolated linker). `npm install` / `yarn install` ignore bun.lock, resolve
// fresh versions and lay out a hoisted tree, where undeclared imports
// resolve again and duplicate copies get bundled — the two problems the
// switch fixed (design/new/toolchain-node-bun.md). Refuse them loudly
// rather than let them half-work.
//
// npm, yarn and bun all set npm_config_user_agent for lifecycle scripts
// ("bun/1.4.4 npm/? node/…", "npm/10.9.9 node/…", "yarn/1.22.22 npm/? …").
const agent = process.env.npm_config_user_agent || ''
if (!agent.startsWith('bun/')) {
  const used = agent.split(' ')[0] || 'an unknown package manager'
  console.error(
    `\nThis repo installs with Bun, not ${used}.\n` +
    'Install Bun (https://bun.sh) and run `bun install`.\n')
  process.exit(1)
}
