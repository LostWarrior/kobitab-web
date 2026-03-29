const repo = (() => {
  const link = document.querySelector('a[href*="github.com/"]')
  if (!link) return 'LostWarrior/Kobitab'
  const match = link.getAttribute('href')?.match(/github\.com\/([^/]+\/[^/]+)/)
  return match?.[1] || 'LostWarrior/Kobitab'
})()

const latestReleaseUrl = `https://api.github.com/repos/${repo}/releases/latest`
const latestManifestUrl = '/download/latest/manifest.json'
const signingBadge = document.getElementById('release-signing-badge')
const analyticsTimeoutMs = 300

async function trackEvent(name, props = {}) {
  if (!window.zaraz || typeof window.zaraz.track !== 'function') return false

  try {
    await window.zaraz.track(name, props)
    return true
  } catch {
    return false
  }
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function isPrimaryNavigationClick(event, link) {
  const target = (link.getAttribute('target') || '').toLowerCase()
  return (
    event.button === 0
    && !event.metaKey
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey
    && (target === '' || target === '_self')
  )
}

function setupAnalyticsTracking() {
  void trackEvent('Page Loaded', { path: window.location.pathname })

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null
    if (!target) return

    const button = target.closest('button, a.btn')
    if (button) {
      const label = button.textContent ? button.textContent.trim().replace(/\s+/g, ' ').slice(0, 80) : 'unknown'
      void trackEvent('Button Click', {
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
    const downloadProps = {
      id: link.id || '',
      file: filename,
      href: link.href
    }

    if (!event.cancelable || !isPrimaryNavigationClick(event, link)) {
      void trackEvent('Download Click', downloadProps)
      return
    }

    event.preventDefault()
    void Promise.race([
      trackEvent('Download Click', downloadProps),
      wait(analyticsTimeoutMs)
    ]).finally(() => {
      window.location.assign(link.href)
    })
  })
}

const heroMascot = document.getElementById('hero-mascot')
if (heroMascot) {
  heroMascot.addEventListener('error', () => {
    heroMascot.classList.add('is-hidden')
  }, { once: true })
}

function setStatus(text) {
  for (const node of document.querySelectorAll('#asset-status')) {
    node.textContent = text
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
      const version = manifest.releaseTag || manifest.version || 'latest'
      const modeLabel = formatBuildMode(modeKey)
      setStatus(modeLabel ? `Latest preview ${version} (${modeLabel})` : `Latest preview ${version}`)
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

    const version = release.tag_name || 'latest'
    setSigningBadge('unknown')
    setStatus(`Latest preview ${version}`)
  } catch (err) {
    setSigningBadge('unknown')
    setStatus('Could not load preview metadata automatically. Try the main download button above.')
  }
}

hydrateReleaseAssets()
setupAnalyticsTracking()
