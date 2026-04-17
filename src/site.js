import { buildWaitlistPayload } from './waitlist.js'

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
const waitlistRequestTimeoutMs = 8000

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

function getNodeLabel(node) {
  return node.textContent ? node.textContent.trim().replace(/\s+/g, ' ').slice(0, 80) : 'unknown'
}

function getAnalyticsLocation(node) {
  return node.getAttribute('data-analytics-location') || ''
}

function isGitHubRepoLink(link) {
  const href = link.getAttribute('href') || ''

  try {
    const url = new URL(href, window.location.origin)
    if (url.hostname !== 'github.com') return false

    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return false

    const repoPath = `${parts[0]}/${parts[1]}`
    return repoPath.toLowerCase() === repo.toLowerCase() && !url.pathname.includes('/releases/download/')
  } catch {
    return false
  }
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

    const waitlistCta = target.closest('[data-waitlist-cta]')
    if (waitlistCta) {
      void trackEvent('Waitlist CTA Click', {
        id: waitlistCta.id || '',
        label: getNodeLabel(waitlistCta),
        location: getAnalyticsLocation(waitlistCta)
      })
    }

    const button = target.closest('button, a.btn')
    if (button && !button.closest('[data-analytics-skip="true"]') && !button.closest('[data-waitlist-cta]')) {
      void trackEvent('Button Click', {
        id: button.id || '',
        label: getNodeLabel(button),
        location: getAnalyticsLocation(button)
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

    if (isDownload) {
      const filename = href.split('/').pop() || href || 'unknown'
      const downloadProps = {
        id: link.id || '',
        label: getNodeLabel(link),
        location: getAnalyticsLocation(link),
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

      return
    }

    if (!isGitHubRepoLink(link)) return

    const githubProps = {
      id: link.id || '',
      label: getNodeLabel(link),
      location: getAnalyticsLocation(link),
      href: link.href
    }

    if (!event.cancelable || !isPrimaryNavigationClick(event, link)) {
      void trackEvent('GitHub Click', githubProps)
      return
    }

    event.preventDefault()
    void Promise.race([
      trackEvent('GitHub Click', githubProps),
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
    setSigningBadge('unknown')
  } catch {
    setSigningBadge('unknown')
  }
}

function setupThemeToggle() {
  const themeToggle = document.getElementById('theme-toggle')
  if (!themeToggle) return

  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme')
    let newTheme

    if (currentTheme) {
      newTheme = currentTheme === 'dark' ? 'light' : 'dark'
    } else {
      const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      newTheme = isSystemDark ? 'light' : 'dark'
    }

    document.documentElement.setAttribute('data-theme', newTheme)
    localStorage.setItem('theme', newTheme)
  })
}

function setWaitlistStatus(statusNode, text, tone = '') {
  if (!statusNode) return
  statusNode.textContent = text
  if (tone) {
    statusNode.dataset.tone = tone
    return
  }
  delete statusNode.dataset.tone
}

function setWaitlistBusy(form, busy) {
  form.dataset.busy = busy ? 'true' : 'false'
  for (const control of form.querySelectorAll('input, button')) {
    control.disabled = busy
  }
}

async function postWaitlist(form) {
  const placement = form.getAttribute('data-waitlist-placement') || 'footer'
  const emailInput = form.querySelector('input[name="email"]')
  const statusNode = form.querySelector('[data-waitlist-status]')
  const submitButton = form.querySelector('button[type="submit"]')

  if (!(emailInput instanceof HTMLInputElement)) return

  const payload = buildWaitlistPayload({
    email: emailInput.value,
    currentUrl: window.location.href,
    referrer: document.referrer,
    placement
  })

  if (!payload) {
    emailInput.setAttribute('aria-invalid', 'true')
    setWaitlistStatus(statusNode, 'Enter a valid email address.', 'error')
    void trackEvent('Waitlist Error', { placement, reason: 'invalid_email' })
    return
  }

  emailInput.removeAttribute('aria-invalid')
  setWaitlistStatus(statusNode, 'Sending your email…')
  setWaitlistBusy(form, true)

  const analyticsProps = { ...payload }
  delete analyticsProps.email
  void trackEvent('Waitlist Submit', analyticsProps)

  const endpoint = toSafeUrl(form.getAttribute('action') || '/api/waitlist', '/api/waitlist')
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), waitlistRequestTimeoutMs)
  let responseStatus = 0

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      credentials: 'same-origin'
    })

    responseStatus = response.status
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`)
    }

    form.reset()
    setWaitlistStatus(statusNode, 'You’re on the list. We’ll email you when premium is ready.', 'success')
    void trackEvent('Waitlist Success', { ...analyticsProps, status: response.status })
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'timeout' : 'request_failed'
    setWaitlistStatus(statusNode, 'Something went wrong. Try again in a moment.', 'error')
    void trackEvent('Waitlist Error', {
      ...analyticsProps,
      reason,
      status: responseStatus || undefined
    })
  } finally {
    window.clearTimeout(timeout)
    setWaitlistBusy(form, false)
    if (submitButton) submitButton.blur()
  }
}

function setupWaitlistForms() {
  for (const form of document.querySelectorAll('[data-waitlist-form]')) {
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      void postWaitlist(form)
    })
  }
}

hydrateReleaseAssets()
setupAnalyticsTracking()
setupWaitlistForms()
setupThemeToggle()
