const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']

export function normalizeWaitlistEmail(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function isValidWaitlistEmail(value) {
  const email = normalizeWaitlistEmail(value)
  return email.length > 3 && email.length <= 254 && EMAIL_PATTERN.test(email)
}

function parseUrl(value) {
  if (!value) return null

  try {
    return new URL(value)
  } catch {
    return null
  }
}

export function buildWaitlistAttribution({
  currentUrl = '',
  referrer = '',
  placement = 'footer'
} = {}) {
  const current = parseUrl(currentUrl)
  const source = parseUrl(referrer)
  const attribution = {
    placement,
    landing_path: '/',
    referrer_host: ''
  }

  if (current) {
    attribution.landing_path = current.pathname || '/'
    for (const key of UTM_KEYS) {
      attribution[key] = current.searchParams.get(key) || ''
    }
  } else {
    for (const key of UTM_KEYS) {
      attribution[key] = ''
    }
  }

  if (source) {
    attribution.referrer_host = source.hostname || ''
  }

  return attribution
}

export function buildWaitlistPayload({
  email,
  currentUrl,
  referrer,
  sourcePage = 'premium_waitlist',
  placement = 'footer'
} = {}) {
  const normalizedEmail = normalizeWaitlistEmail(email)
  if (!isValidWaitlistEmail(normalizedEmail)) return null

  return {
    email: normalizedEmail,
    attribution: {
      source_page: sourcePage,
      ...buildWaitlistAttribution({ currentUrl, referrer, placement })
    }
  }
}
