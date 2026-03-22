const repo = (() => {
  const link = document.querySelector('a[href*="github.com/"]')
  if (!link) return 'LostWarrior/Kobitab'
  const match = link.getAttribute('href')?.match(/github\.com\/([^/]+\/[^/]+)/)
  return match?.[1] || 'LostWarrior/Kobitab'
})()

const latestReleaseUrl = `https://api.github.com/repos/${repo}/releases/latest`
const fallbackReleasePage = `https://github.com/${repo}/releases/latest`
const latestManifestUrl = '/download/latest/manifest.json'
const signingBadge = document.getElementById('release-signing-badge')

function trackEvent(name, props = {}) {
  if (!window.zaraz || typeof window.zaraz.track !== 'function') return
  window.zaraz.track(name, props)
}

function setupAnalyticsTracking() {
  trackEvent('Page Loaded', { path: window.location.pathname })

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null
    if (!target) return

    const button = target.closest('button, a.btn')
    if (button) {
      const label = button.textContent ? button.textContent.trim().replace(/\s+/g, ' ').slice(0, 80) : 'unknown'
      trackEvent('Button Click', {
        id: button.id || '',
        label
      })
    }

    const link = target.closest('a')
    if (!link) return
    const href = link.getAttribute('href') || ''
    const lowerHref = href.toLowerCase()
    const isDownload =
      lowerHref.includes('/releases/download/')
      || lowerHref.endsWith('.dmg')
      || lowerHref.endsWith('.zip')
      || lowerHref.endsWith('.pkg')
      || lowerHref.endsWith('checksums.txt')
      || lowerHref.includes('/download/homebrew/')
      || link.id === 'download-dmg-link'

    if (!isDownload) return
    const filename = href.split('/').pop() || href || 'unknown'
    trackEvent('Download Click', {
      id: link.id || '',
      file: filename
    })
  })
}

const heroMascot = document.getElementById('hero-mascot')
if (heroMascot) {
  heroMascot.addEventListener('error', () => {
    heroMascot.classList.add('is-hidden')
  }, { once: true })
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let i = 0
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i += 1
  }
  return `${size.toFixed(size >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function setStatus(text) {
  for (const node of document.querySelectorAll('#asset-status')) {
    node.textContent = text
  }
}

function setBuildModeNote(mode) {
  let note = ''
  if (mode === 'signed+notarized') {
    note = 'Signed + notarized release. Gatekeeper should allow standard launch.'
  } else if (mode === 'adhoc' || mode === 'unsigned') {
    note = 'Internal preview build without full notarization. Prefer the latest signed public release when possible.'
  } else {
    note = 'Release signing status unavailable. Verify that you are using the latest public release.'
  }

  for (const node of document.querySelectorAll('#build-mode-note')) {
    node.textContent = note
    node.classList.remove('is-hidden')
  }
}

function setSigningBadge(mode) {
  if (!signingBadge) return

  signingBadge.classList.remove('is-hidden')
  signingBadge.classList.remove(
    'release-signing-badge-signed',
    'release-signing-badge-preview',
    'release-signing-badge-unknown'
  )

  if (mode === 'signed+notarized') {
    signingBadge.textContent = 'Signed release'
    signingBadge.classList.add('release-signing-badge-signed')
    return
  }

  if (mode === 'adhoc' || mode === 'unsigned') {
    signingBadge.textContent = 'Preview release'
    signingBadge.classList.add('release-signing-badge-preview')
    return
  }

  signingBadge.classList.add('is-hidden')
}

function toSafeUrl(url, fallback = '#') {
  try {
    const parsed = new URL(url, window.location.origin)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href
    }
    return fallback
  } catch {
    return fallback
  }
}

function getCurrentHref(id) {
  const node = document.getElementById(id)
  return node?.getAttribute('href') || '#'
}

function setLatestDmg(url) {
  const current = getCurrentHref('download-dmg-link')
  const href = toSafeUrl(url, current)
  for (const id of ['download-dmg-link', 'download-latest-link']) {
    const node = document.getElementById(id)
    if (node) node.setAttribute('href', href)
  }
}

function setChecksumsLink(url) {
  const node = document.getElementById('checksums-link')
  if (!node) return
  const current = node.getAttribute('href') || '#'
  node.setAttribute('href', toSafeUrl(url, current))
}

function renderAssetList(items) {
  const assetList = document.getElementById('asset-list')
  if (!assetList) return
  assetList.innerHTML = ''
  for (const itemData of items) {
    const item = document.createElement('li')
    item.className = 'asset-item'
    const left = document.createElement('span')
    left.textContent = itemData.name
    const right = document.createElement('a')
    right.href = toSafeUrl(itemData.url)
    right.textContent = itemData.label
    right.rel = 'noopener noreferrer'
    right.target = '_blank'
    item.append(left, right)
    assetList.appendChild(item)
  }
}

function formatBuildMode(mode) {
  if (mode === 'signed+notarized') return 'signed + notarized'
  if (mode === 'adhoc') return 'ad-hoc preview'
  if (mode === 'unsigned') return 'unsigned'
  return ''
}

function buildManifestAssets(manifest) {
  if (!manifest || typeof manifest !== 'object') return []
  const assetMap = manifest.assets && typeof manifest.assets === 'object' ? manifest.assets : {}
  const baseUrl =
    typeof manifest.releaseBaseUrl === 'string' && manifest.releaseBaseUrl.length > 0
      ? manifest.releaseBaseUrl
      : null
  const assetEntries = [
    ['universalDmg', 'Universal DMG'],
    ['arm64Dmg', 'Apple Silicon DMG'],
    ['x64Dmg', 'Intel DMG']
  ]

  const items = []
  for (const [key, name] of assetEntries) {
    const file = assetMap[key]
    if (!file || !baseUrl) continue
    const url = `${baseUrl}/${file}`
    items.push({
      name: file,
      url,
      label: `Download ${name}`
    })
  }
  return items
}

async function hydrateReleaseAssets() {
  try {
    const manifestRes = await fetch(latestManifestUrl, { cache: 'no-store' })
    if (manifestRes.ok) {
      const manifest = await manifestRes.json()
      const modeKey = String(manifest.buildMode || 'unknown').toLowerCase()
      const manifestAssets = buildManifestAssets(manifest)
      const preferredDmg = manifestAssets.find((item) => item.name.toLowerCase().endsWith('universal.dmg'))
        || manifestAssets.find((item) => item.name.toLowerCase().endsWith('.dmg'))
      setLatestDmg(preferredDmg?.url)
      setChecksumsLink(manifest.checksumsFile)

      if (manifestAssets.length > 0) {
        renderAssetList(manifestAssets)
      }
      const version = manifest.releaseTag || manifest.version || 'latest'
      const modeLabel = formatBuildMode(modeKey)
      setStatus(modeLabel ? `Latest preview ${version} (${modeLabel})` : `Latest preview ${version}`)
      setBuildModeNote(modeKey)
      setSigningBadge(modeKey)
      return
    }

    const res = await fetch(latestReleaseUrl)
    if (!res.ok) throw new Error(`GitHub API request failed (${res.status})`)
    const release = await res.json()
    const allAssets = Array.isArray(release.assets) ? release.assets : []
    const assets = allAssets.filter((asset) => {
      const name = String(asset.name).toLowerCase()
      return name.endsWith('.dmg')
    })

    const dmgAsset =
      assets.find((asset) => String(asset.name).toLowerCase().endsWith('universal.dmg'))
      || assets.find((asset) => String(asset.name).toLowerCase().endsWith('.dmg'))
    const checksumsAsset = allAssets.find((asset) => String(asset.name).toLowerCase() === 'checksums.txt')
    if (dmgAsset?.browser_download_url) {
      setLatestDmg(dmgAsset.browser_download_url)
    }
    setChecksumsLink(checksumsAsset?.browser_download_url)

    renderAssetList(
      assets.map((asset) => ({
        name: asset.name,
        url: asset.browser_download_url,
        label: `Download ${formatSize(asset.size)}`
      }))
    )

    const version = release.tag_name || 'latest'
    setBuildModeNote('unknown')
    setSigningBadge('unknown')
    setStatus(`Latest preview ${version}`)
  } catch (err) {
    setBuildModeNote('unknown')
    setSigningBadge('unknown')
    setStatus('Could not load preview metadata automatically. Try the main download button above.')
  }
}

hydrateReleaseAssets()
setupAnalyticsTracking()
