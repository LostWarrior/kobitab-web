import { buildWaitlistPayload, isValidWaitlistEmail, normalizeWaitlistEmail } from './waitlist.js'

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
const waitlistRetryCooldownMs = 60_000
const waitlistCooldownTimers = new WeakMap()

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

function syncWaitlistSubmitState(form) {
  const emailInput = form.querySelector('input[name="email"]')
  const submitButton = form.querySelector('button[type="submit"]')
  if (!(emailInput instanceof HTMLInputElement) || !(submitButton instanceof HTMLButtonElement)) return

  const busy = form.dataset.busy === 'true'
  const normalized = normalizeWaitlistEmail(emailInput.value)
  const valid = isValidWaitlistEmail(normalized)
  const cooldownEmail = form.dataset.cooldownEmail || ''
  const retryUntil = Number(form.dataset.retryUntil || '0')
  const inCooldown = Boolean(
    normalized
    && cooldownEmail
    && normalized === cooldownEmail
    && retryUntil > Date.now()
  )
  submitButton.disabled = busy || !valid || inCooldown
}

function setEmailFormatState(form, statusNode, showMessage = false) {
  const emailInput = form.querySelector('input[name="email"]')
  if (!(emailInput instanceof HTMLInputElement)) return true

  const normalized = normalizeWaitlistEmail(emailInput.value)
  const isEmpty = normalized.length === 0
  const valid = isValidWaitlistEmail(normalized)
  const isInvalid = !isEmpty && !valid

  if (isInvalid) {
    form.dataset.emailInvalid = 'true'
    emailInput.setAttribute('aria-invalid', 'true')
    if (showMessage) {
      setWaitlistStatus(statusNode, 'Enter a valid email address (example@domain.com).', 'error')
    }
    return false
  }

  delete form.dataset.emailInvalid
  emailInput.removeAttribute('aria-invalid')
  return true
}

function setWaitlistBusy(form, busy) {
  form.dataset.busy = busy ? 'true' : 'false'
  for (const control of form.querySelectorAll('input, button')) {
    control.disabled = busy
  }
  syncWaitlistSubmitState(form)
}

function setWaitlistUiState(form, state) {
  const emailInput = form.querySelector('input[name="email"]')
  const submitButton = form.querySelector('button[type="submit"]')
  if (!(emailInput instanceof HTMLInputElement) || !(submitButton instanceof HTMLButtonElement)) return

  if (!submitButton.dataset.defaultLabel) {
    submitButton.dataset.defaultLabel = submitButton.textContent?.trim() || 'Join waitlist'
  }

  const defaultLabel = submitButton.dataset.defaultLabel
  form.dataset.status = state

  if (state === 'success') {
    submitButton.textContent = 'You\'re in'
  } else if (state === 'error') {
    submitButton.textContent = 'Try again!'
  } else if (state === 'sending') {
    submitButton.textContent = 'Joining...'
  } else {
    submitButton.textContent = defaultLabel
  }
}

function stopRetryCountdown(form) {
  const timerId = waitlistCooldownTimers.get(form)
  if (timerId) {
    window.clearInterval(timerId)
    waitlistCooldownTimers.delete(form)
  }
}

function updateRetryCountdown(form, statusNode) {
  const emailInput = form.querySelector('input[name="email"]')
  if (!(emailInput instanceof HTMLInputElement)) return

  const normalized = normalizeWaitlistEmail(emailInput.value)
  const cooldownEmail = form.dataset.cooldownEmail || ''
  const retryUntil = Number(form.dataset.retryUntil || '0')
  const remainingMs = retryUntil - Date.now()
  const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000))
  const active = Boolean(normalized && cooldownEmail && normalized === cooldownEmail && remainingMs > 0)

  if (!active) {
    stopRetryCountdown(form)
    if (remainingMs <= 0) {
      delete form.dataset.cooldownEmail
      delete form.dataset.retryUntil
      setWaitlistUiState(form, 'idle')
      setWaitlistStatus(statusNode, '')
      syncWaitlistSubmitState(form)
    }
    return
  }

  setWaitlistUiState(form, 'error')
  setWaitlistStatus(statusNode, `Please wait ${remainingSeconds}s before retrying this email.`, 'error')
  syncWaitlistSubmitState(form)
}

function startRetryCountdown(form, statusNode, email) {
  startRetryCountdownWithSeconds(form, statusNode, email, waitlistRetryCooldownMs / 1000)
}

function parseRetryAfterHeader(value) {
  if (!value) return 0
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric)

  const dateMs = Date.parse(value)
  if (!Number.isFinite(dateMs)) return 0
  const seconds = Math.ceil((dateMs - Date.now()) / 1000)
  return seconds > 0 ? seconds : 0
}

function getTurnstileToken(form) {
  const selectors = [
    'input[name="cf-turnstile-response"]',
    'input[name="turnstile_token"]',
    'input[name="turnstileToken"]'
  ]

  for (const selector of selectors) {
    const node = form.querySelector(selector)
    if (node instanceof HTMLInputElement) {
      const value = node.value.trim()
      if (value) return value
    }
  }

  return ''
}

async function parseRateLimitCooldownSeconds(response) {
  if (!(response instanceof Response)) return waitlistRetryCooldownMs / 1000

  const headerSeconds = parseRetryAfterHeader(response.headers.get('retry-after'))
  if (headerSeconds > 0) return headerSeconds

  try {
    const data = await response.clone().json()
    const bodySeconds = Number(data?.error?.retry_after_seconds)
    if (Number.isFinite(bodySeconds) && bodySeconds > 0) {
      return Math.floor(bodySeconds)
    }
  } catch {
    // Ignore non-JSON error body.
  }

  return waitlistRetryCooldownMs / 1000
}

function startRetryCountdownWithSeconds(form, statusNode, email, seconds) {
  const clampedSeconds = Number.isFinite(seconds) ? Math.max(1, Math.floor(seconds)) : (waitlistRetryCooldownMs / 1000)
  stopRetryCountdown(form)
  form.dataset.cooldownEmail = email
  form.dataset.retryUntil = String(Date.now() + clampedSeconds * 1000)
  updateRetryCountdown(form, statusNode)
  const timerId = window.setInterval(() => {
    updateRetryCountdown(form, statusNode)
  }, 1000)
  waitlistCooldownTimers.set(form, timerId)
}

async function postWaitlist(form) {
  const placement = form.getAttribute('data-waitlist-placement') || 'footer'
  const emailInput = form.querySelector('input[name="email"]')
  const statusNode = form.querySelector('[data-waitlist-status]')
  const submitButton = form.querySelector('button[type="submit"]')

  if (!(emailInput instanceof HTMLInputElement)) return
  if (!setEmailFormatState(form, statusNode, true)) {
    setWaitlistUiState(form, 'idle')
    syncWaitlistSubmitState(form)
    return
  }

  const normalizedEmail = normalizeWaitlistEmail(emailInput.value)
  const now = Date.now()
  const successEmail = form.dataset.successEmail || ''
  const cooldownEmail = form.dataset.cooldownEmail || ''
  const retryUntil = Number(form.dataset.retryUntil || '0')

  if (normalizedEmail && successEmail && normalizedEmail === successEmail) {
    setWaitlistStatus(statusNode, 'This email is already on the list. Use a different one to join again.', 'success')
    setWaitlistUiState(form, 'success')
    syncWaitlistSubmitState(form)
    return
  }

  if (normalizedEmail && cooldownEmail && normalizedEmail === cooldownEmail && retryUntil > now) {
    updateRetryCountdown(form, statusNode)
    return
  }

  const payload = buildWaitlistPayload({
    email: emailInput.value,
    turnstileToken: getTurnstileToken(form),
    currentUrl: window.location.href,
    referrer: document.referrer,
    placement
  })

  if (!payload) {
    setEmailFormatState(form, statusNode, true)
    setWaitlistUiState(form, 'error')
    syncWaitlistSubmitState(form)
    void trackEvent('Waitlist Error', { placement, reason: 'invalid_email' })
    return
  }

  emailInput.removeAttribute('aria-invalid')
  setWaitlistStatus(statusNode, 'Sending your email…')
  setWaitlistUiState(form, 'sending')
  setWaitlistBusy(form, true)

  const analyticsProps = { ...payload }
  delete analyticsProps.email
  void trackEvent('Waitlist Submit', analyticsProps)

  const endpoint = toSafeUrl(form.getAttribute('action') || '/api/waitlist', '/api/waitlist')
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), waitlistRequestTimeoutMs)
  let responseStatus = 0
  let retryAfterSeconds = 0
  let responseErrorCode = ''

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
      if (response.status === 429) {
        retryAfterSeconds = await parseRateLimitCooldownSeconds(response)
      } else {
        try {
          const errorBody = await response.clone().json()
          responseErrorCode = String(errorBody?.error?.code || '')
        } catch {
          responseErrorCode = ''
        }
      }
      throw new Error(`Request failed (${response.status})`)
    }

    form.reset()
    stopRetryCountdown(form)
    form.dataset.successEmail = payload.email
    delete form.dataset.cooldownEmail
    delete form.dataset.retryUntil
    setWaitlistStatus(statusNode, 'You’re on the list. We’ll email you when premium is ready.', 'success')
    setWaitlistUiState(form, 'success')
    void trackEvent('Waitlist Success', { ...analyticsProps, status: response.status })
  } catch (error) {
    const isTimeout = error?.name === 'AbortError'
    const isRateLimited = responseStatus === 429
    const reason = isTimeout ? 'timeout' : (isRateLimited ? 'rate_limited' : 'request_failed')

    if (isRateLimited) {
      startRetryCountdownWithSeconds(form, statusNode, payload.email, retryAfterSeconds)
    } else if (responseErrorCode === 'turnstile_failed') {
      setWaitlistStatus(statusNode, 'Please complete verification and try again.', 'error')
      setWaitlistUiState(form, 'error')
    } else {
      setWaitlistStatus(statusNode, 'Something went wrong. Try again in a moment.', 'error')
      setWaitlistUiState(form, 'error')
    }

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
    for (const legacyHint of form.querySelectorAll('[data-waitlist-inline-hint]')) {
      legacyHint.remove()
    }

    setWaitlistUiState(form, 'idle')
    syncWaitlistSubmitState(form)

    const emailInput = form.querySelector('input[name="email"]')
    if (emailInput instanceof HTMLInputElement) {
      emailInput.addEventListener('input', () => {
        const statusNode = form.querySelector('[data-waitlist-status]')
        const normalized = normalizeWaitlistEmail(emailInput.value)
        const successEmail = form.dataset.successEmail || ''
        const cooldownEmail = form.dataset.cooldownEmail || ''
        const retryUntil = Number(form.dataset.retryUntil || '0')
        const inCooldown = Boolean(normalized && cooldownEmail && normalized === cooldownEmail && retryUntil > Date.now())

        if (form.dataset.status === 'success' && normalized !== successEmail) {
          setWaitlistUiState(form, 'idle')
          setWaitlistStatus(statusNode, '')
          setEmailFormatState(form, statusNode, false)
        }

        if (form.dataset.status === 'error') {
          if (inCooldown) {
            updateRetryCountdown(form, statusNode)
          } else {
            if (!setEmailFormatState(form, statusNode, false)) {
              setWaitlistUiState(form, 'idle')
              setWaitlistStatus(statusNode, 'Enter a valid email address (example@domain.com).', 'error')
            } else {
              setWaitlistUiState(form, 'idle')
              setWaitlistStatus(statusNode, '')
            }
          }
        }

        if (form.dataset.status !== 'error' && form.dataset.status !== 'success') {
          setWaitlistUiState(form, 'idle')
          if (!setEmailFormatState(form, statusNode, false)) {
            setWaitlistStatus(statusNode, 'Enter a valid email address (example@domain.com).', 'error')
          } else if ((statusNode?.textContent || '').includes('valid email address')) {
            setWaitlistStatus(statusNode, '')
          }
        }
        syncWaitlistSubmitState(form)
      })
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault()
      void postWaitlist(form)
    })
  }
}

function scheduleNonCriticalWork() {
  const run = () => {
    hydrateReleaseAssets()
    setupAnalyticsTracking()
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 1500 })
    return
  }

  window.setTimeout(run, 0)
}

scheduleNonCriticalWork()
setupWaitlistForms()
setupThemeToggle()
