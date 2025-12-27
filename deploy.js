#!/usr/bin/env node

import { execSync } from 'child_process'
import { readFileSync, rmSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const PLUGINS_DIR = {
  linux: join(homedir(), '.config', 'opencode', 'plugin'),
  darwin: join(homedir(), '.config', 'opencode', 'plugin'),
  win32: join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'opencode', 'plugin')
}

function getPluginsDir() {
  const dir = PLUGINS_DIR[process.platform]
  if (!dir) {
    console.error(`Unsupported platform: ${process.platform}`)
    process.exit(1)
  }
  return dir
}

function copyRecursive(src, dest) {
  const stat = statSync(src)

  if (stat.isDirectory()) {
    if (!existsSync(dest)) {
      mkdirSync(dest, { recursive: true })
    }
    const files = readdirSync(src)
    for (const file of files) {
      copyRecursive(join(src, file), join(dest, file))
    }
  } else {
    copyFileSync(src, dest)
  }
}

function build() {
  console.log('Building plugin...')
  try {
    execSync('npm run build', { stdio: 'inherit' })
    console.log('✓ Build complete')
  } catch (error) {
    console.error('✗ Build failed')
    process.exit(1)
  }
}

function install() {
  const pluginsDir = getPluginsDir()
  console.log(`Installing to ${pluginsDir}...`)

  const distDir = 'dist'

  if (!existsSync(distDir)) {
    console.error('✗ dist/ directory not found. Run build first.')
    process.exit(1)
  }

  const files = readdirSync(distDir)

  for (const file of files) {
    const srcPath = join(distDir, file)
    const destPath = join(pluginsDir, file)

    if (existsSync(destPath)) {
      const stat = statSync(destPath)
      if (stat.isDirectory()) {
        console.log(`  Removing existing ${file}/`)
        rmSync(destPath, { recursive: true, force: true })
      } else {
        console.log(`  Removing existing ${file}`)
        rmSync(destPath, { force: true })
      }
    }
  }

  console.log('  Copying files...')
  copyRecursive(distDir, pluginsDir)
  console.log('✓ Installation complete')
}

function main() {
  const args = process.argv.slice(2)
  const buildOnly = args.includes('--build-only') || args.includes('-b')
  const installOnly = args.includes('--install-only') || args.includes('-i')

  if (buildOnly) {
    build()
  } else if (installOnly) {
    install()
  } else {
    build()
    install()
  }
}

main()