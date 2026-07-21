#!/usr/bin/env bun
// Cross-compiles single-file binaries for GitHub Releases.
// Usage: bun run build:release [version]   (default: version from package.json)
import { $ } from 'bun'
import pkg from '../package.json'

const version = process.argv[2] ?? pkg.version

const targets = [
  { target: 'bun-linux-x64', name: 'kv-linux-x64' },
  { target: 'bun-linux-arm64', name: 'kv-linux-arm64' },
  { target: 'bun-darwin-x64', name: 'kv-darwin-x64' },
  { target: 'bun-darwin-arm64', name: 'kv-darwin-arm64' },
  { target: 'bun-windows-x64', name: 'kv-windows-x64' },
]

await $`rm -rf dist/release`
for (const { target, name } of targets) {
  const isWindows = target.startsWith('bun-windows')
  // Bun auto-appends .exe for Windows targets even when the given
  // --outfile doesn't have it.
  const out = `dist/release/${name}${isWindows ? '.exe' : ''}`
  console.log(`→ ${target}`)
  await $`bun build --compile --minify --target=${target} src/index.ts --outfile dist/release/${name}`
  if (isWindows) {
    await $`cd dist/release && zip ${name}-v${version}.zip ${name}.exe`
  } else {
    await $`tar -czf ${out}-v${version}.tar.gz -C dist/release ${name}`
  }
  await $`rm ${out}`
}
console.log(`\nArtifacts in dist/release/ (v${version}):`)
await $`ls -lh dist/release`
