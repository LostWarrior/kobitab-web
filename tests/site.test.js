import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const projectRoot = new URL('..', import.meta.url).pathname
const pagePaths = [
  'src/index.html',
  'src/compare/index.html',
  'src/compare/apple-notes/index.html',
  'src/compare/dropbox/index.html',
  'src/compare/obsidian/index.html',
  'src/blog/index.html',
  'src/blog/how-we-built-deterministic-search/index.html'
]

function read(relativePath) {
  return readFileSync(join(projectRoot, relativePath), 'utf8')
}

test('every public page keeps the shared shell and one primary heading', () => {
  for (const pagePath of pagePaths) {
    const html = read(pagePath)
    assert.equal((html.match(/<h1\b/g) || []).length, 1, pagePath)
    assert.match(html, /href="\/styles\.css"/, pagePath)
    assert.match(html, /src="\/theme-init\.js"/, pagePath)
    assert.match(html, /src="\/site\.js"/, pagePath)
    assert.match(html, /<link rel="canonical"/, pagePath)
    assert.doesNotMatch(html, /<script>\s*\(/, pagePath)
  }
})

test('homepage keeps the animated squirrels and real iPhone coming-soon preview', () => {
  const html = read('src/index.html')
  const css = read('src/styles.css')

  assert.match(html, /id="hero-mascot"/)
  assert.match(html, /src="\/kobi-ios-companion\.png"/)
  assert.match(html, /Coming soon to iPhone/)
  assert.match(html, /privacy-flow-stage/)
  assert.match(html, /brew tap LostWarrior\/kobitab &amp;&amp; brew install kobitab/)
  assert.match(css, /@keyframes mascot-float/)
  assert.match(css, /@keyframes phone-float/)
  assert.match(css, /@keyframes acorn-drift/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
})

test('homepage presents Kobi agents as a first-class, reviewable product capability', () => {
  const html = read('src/index.html')
  const component = read('src/agent-showcase.js')

  assert.match(html, /id="agents"/)
  assert.match(html, /data-agent-showcase/)
  assert.match(component, /Daily Work Brief/)
  assert.match(component, /Family Calendar Assistant/)
  assert.match(component, /Grocery Delivery Planner/)
  assert.match(html, /Approve once for recurring work/)
  assert.match(html, /Find · Draft · Approve · Automate/)
})

test('comparison pages include honest verdicts and official source links', () => {
  const appleNotes = read('src/compare/apple-notes/index.html')
  const dropbox = read('src/compare/dropbox/index.html')
  const obsidian = read('src/compare/obsidian/index.html')

  assert.match(appleNotes, /Choose Apple Notes if/)
  assert.match(appleNotes, /https:\/\/support\.apple\.com\/en-lamr\/guide\/security\/sec1782bcab1\/web/)
  assert.match(appleNotes, /https:\/\/support\.apple\.com\/guide\/notes\/share-your-notes-and-folders-apda5307056b\/mac/)

  assert.match(dropbox, /Choose Dropbox if/)
  assert.match(dropbox, /https:\/\/help\.dropbox\.com\/sync\/sync-overview/)
  assert.match(dropbox, /https:\/\/help\.dropbox\.com\/security\/safe-to-use/)

  assert.match(obsidian, /Choose Obsidian if/)
  assert.match(obsidian, /https:\/\/obsidian\.md\/help\/create-note/)
  assert.match(obsidian, /https:\/\/obsidian\.md\/help\/Obsidian%20Sync\/Security%20and%20privacy/)
})

test('sitemap exposes the homepage, blog, and comparison routes', () => {
  const sitemap = read('src/sitemap.xml')
  for (const route of [
    'https://kobitab.com/',
    'https://kobitab.com/blog/',
    'https://kobitab.com/compare/',
    'https://kobitab.com/compare/apple-notes/',
    'https://kobitab.com/compare/dropbox/',
    'https://kobitab.com/compare/obsidian/'
  ]) {
    assert.match(sitemap, new RegExp(`<loc>${route.replaceAll('.', '\\.')}</loc>`))
  }
})
