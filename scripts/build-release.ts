#!/usr/bin/env bun
// Cross-compiles single-file binaries for GitHub Releases.
// Usage: bun run build:release [version]   (default: version from package.json)
import { $ } from 'bun'
import pkg from '../package.json'

const version = process.argv[2] ?? pkg.version

const targets = [
  { target: 'bun-linux-x64', name: 'key-linux-x64' },
  { target: 'bun-linux-arm64', name: 'key-linux-arm64' },
  { target: 'bun-darwin-x64', name: 'key-darwin-x64' },
  { target: 'bun-darwin-arm64', name: 'key-darwin-arm64' },
]

await $`rm -rf dist/release`
for (const { target, name } of targets) {
  const out = `dist/release/${name}`
  console.log(`→ ${target}`)
  await $`bun build --compile --minify --target=${target} src/index.ts --outfile ${out}`
  await $`tar -czf ${out}-v${version}.tar.gz -C dist/release ${name}`
  await $`rm ${out}`
}
console.log(`\nArtifacts in dist/release/ (v${version}):`)
await $`ls -lh dist/release`
