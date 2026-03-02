const repo = (() => {
  const link = document.querySelector('a[href*="github.com/"]')
  if (!link) return 'LostWarrior/Kobitab'
  const match = link.getAttribute('href')?.match(/github\.com\/([^/]+\/[^/]+)/)
  return match?.[1] || 'LostWarrior/Kobitab'
})()

const latestReleaseUrl = `https://api.github.com/repos/${repo}/releases/latest`
const fallbackReleasePage = `https://github.com/${repo}/releases/latest`
const latestManifestUrl = '/download/latest/manifest.json'

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
    note = 'This release is signed and notarized by Apple.'
  } else if (mode === 'adhoc' || mode === 'unsigned') {
    note = 'To keep KobiTab free, this release may not be Apple notarized. If macOS warns, right-click KobiTab in Applications and choose Open.'
  } else {
    note = 'If macOS blocks first launch, right-click KobiTab in Applications and choose Open.'
  }

  for (const node of document.querySelectorAll('#build-mode-note')) {
    node.textContent = note
    node.classList.remove('is-hidden')
  }
}

function toSafeUrl(url, fallback = fallbackReleasePage) {
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

function setLatestDmg(url) {
  const href = toSafeUrl(url)
  for (const id of ['download-dmg-link', 'download-latest-link']) {
    const node = document.getElementById(id)
    if (node) node.setAttribute('href', href)
  }
}

function setChecksumsLink(url) {
  const node = document.getElementById('checksums-link')
  if (!node) return
  node.setAttribute('href', toSafeUrl(url))
}

function renderAssetList(items) {
  const assetList = document.getElementById('asset-list')
  if (!assetList) return
  assetList.innerHTML = ''
  for (const itemData of items) {
    const item = document.createElement('li')
    item.className = 'asset-item' // Added class for proper styling
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
  if (mode === 'unsigned') return 'unsigned'
  return mode
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
    ['x64Dmg', 'Intel DMG'],
    ['universalZip', 'Universal ZIP'],
    ['arm64Zip', 'Apple Silicon ZIP'],
    ['x64Zip', 'Intel ZIP']
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
      const manifestAssets = buildManifestAssets(manifest).filter(item => {
        return item.name.toLowerCase().endsWith('.dmg')
      })
      const preferredDmg = manifestAssets.find((item) => item.name.toLowerCase().endsWith('universal.dmg'))
        || manifestAssets.find((item) => item.name.toLowerCase().endsWith('.dmg'))
      setLatestDmg(preferredDmg?.url || fallbackReleasePage)
      setChecksumsLink(manifest.checksumsFile || fallbackReleasePage)

      if (manifestAssets.length > 0) {
        renderAssetList(manifestAssets)
      }
      const version = manifest.releaseTag || manifest.version || 'latest'
      setStatus(`Latest release ${version}`)
      // setBuildModeNote(modeKey) // Removed redundant text
      return
    }

    const res = await fetch(latestReleaseUrl)
    if (!res.ok) throw new Error(`GitHub API request failed (${res.status})`)
    const release = await res.json()
    const allAssets = Array.isArray(release.assets) ? release.assets : []
    const assets = allAssets.filter(asset => {
      return asset.name.toLowerCase().endsWith('.dmg')
    })

    const dmgAsset = assets.find((asset) => String(asset.name).toLowerCase().endsWith('.dmg'))
    const checksumsAsset = assets.find((asset) => String(asset.name).toLowerCase() === 'checksums.txt')
    if (dmgAsset?.browser_download_url) {
      setLatestDmg(dmgAsset.browser_download_url)
    } else {
      setLatestDmg(fallbackReleasePage)
    }
    setChecksumsLink(checksumsAsset?.browser_download_url || fallbackReleasePage)

    renderAssetList(
      assets.map((asset) => ({
        name: asset.name,
        url: asset.browser_download_url,
        label: `Download ${formatSize(asset.size)}`
      }))
    )

    const version = release.tag_name || 'latest'
    // setBuildModeNote('unknown') // Removed redundant text
    setStatus(`Latest release ${version}`)
  } catch (err) {
    setLatestDmg(fallbackReleasePage)
    setChecksumsLink(fallbackReleasePage)
    // setBuildModeNote('unknown') // Removed redundant text
    setStatus(`Could not load release metadata automatically. Open ${fallbackReleasePage}.`)
  }
}

hydrateReleaseAssets()
