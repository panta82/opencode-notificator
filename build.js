import { build as esbuild } from 'esbuild'
import { readdirSync, statSync, copyFileSync, mkdirSync } from 'fs'
import { join } from 'path'

async function copyRecursive(src, dest) {
  const stat = statSync(src)

  if (stat.isDirectory()) {
    mkdirSync(dest, { recursive: true })
    const files = readdirSync(src)
    for (const file of files) {
      copyRecursive(join(src, file), join(dest, file))
    }
  } else {
    copyFileSync(src, dest)
  }
}

async function build() {
  console.log('Building...')

  await esbuild({
    entryPoints: ['notificator.js'],
    bundle: true,
    outfile: 'dist/notificator.js',
    platform: 'node',
    target: 'node18',
    format: 'esm',
    external: ['@opencode-ai/plugin'],
    sourcemap: true,
  })

  console.log('Copying sounds...')
  copyRecursive('notificator-sounds', 'dist/notificator-sounds')

  console.log('Copying config...')
  copyFileSync('notificator.jsonc', 'dist/notificator.jsonc')

  console.log('Build complete! Copy dist/ to your OpenCode plugins directory.')
}

build().catch(console.error)