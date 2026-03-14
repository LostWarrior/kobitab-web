import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const srcDir = join(projectRoot, 'src')
const distDir = join(projectRoot, 'dist')

rmSync(distDir, { recursive: true, force: true })
mkdirSync(distDir, { recursive: true })

// Publish all static files from src so media assets are available at runtime.
cpSync(srcDir, distDir, { recursive: true })

const appReleaseRepo = process.env.APP_RELEASE_REPO || 'LostWarrior/Kobitab'

function collectFiles(dir) {
  const entries = readdirSync(dir)
  const files = []
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const st = statSync(fullPath)
    if (st.isDirectory()) {
      files.push(...collectFiles(fullPath))
    } else if (st.isFile()) {
      files.push(fullPath)
    }
  }
  return files
}

for (const filePath of collectFiles(distDir).filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(filePath, 'utf-8').replaceAll('__GITHUB_REPOSITORY__', appReleaseRepo)
  writeFileSync(filePath, html)
}

console.log(`Built KobiTab web site for app repo ${appReleaseRepo}`)
