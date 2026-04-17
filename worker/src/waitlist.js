const EMAIL_MAX_LENGTH = 254;
const ATTRIBUTION_TEXT_MAX_LENGTH = 128;
const PATH_MAX_LENGTH = 2048;
const RATE_LIMIT_CLEANUP_MULTIPLIER = 2;
const SITE_ORIGINS = [
  "https://kobitab.com",
  "https://www.kobitab.com",
];
const REQUEST_LIMIT = 5;
const REQUEST_WINDOW_MS = 60_000;

const SIGNUP_SELECT_SQL = `
SELECT
  email,
  first_seen_at,
  last_seen_at,
  first_source_page,
  first_landing_path,
  first_placement,
  first_utm_source,
  first_utm_medium,
  first_utm_campaign,
  first_utm_content,
  first_utm_term,
  first_request_origin,
  first_request_referrer_origin,
  last_source_page,
  last_landing_path,
  last_placement,
  last_utm_source,
  last_utm_medium,
  last_utm_campaign,
  last_utm_content,
  last_utm_term,
  last_request_origin,
  last_request_referrer_origin,
  signup_count
FROM waitlist_signups
WHERE email = ?
LIMIT 1
`;

const SIGNUP_UPSERT_SQL = `
INSERT INTO waitlist_signups (
  email,
  first_seen_at,
  last_seen_at,
  first_source_page,
  first_landing_path,
  first_placement,
  first_utm_source,
  first_utm_medium,
  first_utm_campaign,
  first_utm_content,
  first_utm_term,
  first_request_origin,
  first_request_referrer_origin,
  last_source_page,
  last_landing_path,
  last_placement,
  last_utm_source,
  last_utm_medium,
  last_utm_campaign,
  last_utm_content,
  last_utm_term,
  last_request_origin,
  last_request_referrer_origin,
  signup_count,
  updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(email) DO UPDATE SET
  last_seen_at = excluded.last_seen_at,
  last_source_page = excluded.last_source_page,
  last_landing_path = excluded.last_landing_path,
  last_placement = excluded.last_placement,
  last_utm_source = excluded.last_utm_source,
  last_utm_medium = excluded.last_utm_medium,
  last_utm_campaign = excluded.last_utm_campaign,
  last_utm_content = excluded.last_utm_content,
  last_utm_term = excluded.last_utm_term,
  last_request_origin = excluded.last_request_origin,
  last_request_referrer_origin = excluded.last_request_referrer_origin,
  signup_count = signup_count + 1,
  updated_at = excluded.updated_at
`;

const RATE_LIMIT_UPSERT_SQL = `
INSERT INTO waitlist_rate_limits (
  bucket_start,
  client_key,
  attempts,
  first_seen_at,
  last_seen_at,
  updated_at
) VALUES (?, ?, 1, ?, ?, ?)
ON CONFLICT(bucket_start, client_key) DO UPDATE SET
  attempts = attempts + 1,
  last_seen_at = excluded.last_seen_at,
  updated_at = excluded.updated_at
`;

const RATE_LIMIT_SELECT_SQL = `
SELECT
  bucket_start,
  client_key,
  attempts
FROM waitlist_rate_limits
WHERE bucket_start = ? AND client_key = ?
LIMIT 1
`;

const RATE_LIMIT_CLEANUP_SQL = `
DELETE FROM waitlist_rate_limits
WHERE bucket_start < ?
`;

export function normalizeEmail(input) {
  if (typeof input !== "string") {
    return null;
  }

  const normalized = input.normalize("NFKC").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.length > EMAIL_MAX_LENGTH) {
    return null;
  }

  return normalized;
}

export function isValidEmail(email) {
  if (typeof email !== "string" || !email) {
    return false;
  }

  if (email.length > EMAIL_MAX_LENGTH) {
    return false;
  }

  if (email.includes(" ") || email.includes("\n") || email.includes("\r") || email.includes("\t")) {
    return false;
  }

  const atIndex = email.indexOf("@");
  if (atIndex <= 0 || atIndex !== email.lastIndexOf("@")) {
    return false;
  }

  const localPart = email.slice(0, atIndex);
  const domainPart = email.slice(atIndex + 1);
  if (!localPart || !domainPart) {
    return false;
  }

  if (localPart.length > 64 || domainPart.length > 253) {
    return false;
  }

  if (localPart.startsWith(".") || localPart.endsWith(".") || localPart.includes("..")) {
    return false;
  }

  if (domainPart.startsWith(".") || domainPart.endsWith(".") || domainPart.includes("..")) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(email);
}

export function sanitizeAttributionText(value, maxLength = ATTRIBUTION_TEXT_MAX_LENGTH) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  if (!cleaned) {
    return null;
  }

  return cleaned.slice(0, maxLength);
}

export function sanitizeLandingPath(value) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.normalize("NFKC").trim();
  if (!cleaned) {
    return null;
  }

  let candidate = cleaned;
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
      candidate = new URL(candidate).pathname;
    }
  } catch {
    return null;
  }

  candidate = candidate.split(/[?#]/, 1)[0];
  if (!candidate.startsWith("/")) {
    return null;
  }

  if (candidate.length > PATH_MAX_LENGTH) {
    candidate = candidate.slice(0, PATH_MAX_LENGTH);
  }

  return candidate;
}

export function normalizeAttribution(raw = {}, headers = null) {
  const originHeader = headers?.get?.("origin") ?? null;
  const refererHeader = headers?.get?.("referer") ?? null;

  return {
    source_page: sanitizeAttributionText(raw.source_page ?? raw.sourcePage),
    landing_path: sanitizeLandingPath(raw.landing_path ?? raw.landingPath),
    placement: sanitizeAttributionText(raw.placement),
    utm_source: sanitizeAttributionText(raw.utm_source ?? raw.utmSource),
    utm_medium: sanitizeAttributionText(raw.utm_medium ?? raw.utmMedium),
    utm_campaign: sanitizeAttributionText(raw.utm_campaign ?? raw.utmCampaign),
    utm_content: sanitizeAttributionText(raw.utm_content ?? raw.utmContent),
    utm_term: sanitizeAttributionText(raw.utm_term ?? raw.utmTerm),
    request_origin: extractOrigin(originHeader),
    request_referrer_origin: extractOrigin(refererHeader),
  };
}

export function extractOrigin(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function buildAllowedOrigins(requestUrl, allowedOrigins = "") {
  const origins = new Set();
  const requestOrigin = extractOrigin(requestUrl);
  if (requestOrigin) {
    origins.add(requestOrigin);
  }

  const rawValues = Array.isArray(allowedOrigins)
    ? allowedOrigins
    : String(allowedOrigins)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

  for (const value of rawValues) {
    const origin = extractOrigin(value);
    if (origin) {
      origins.add(origin);
    }
  }

  return [...origins];
}

export function isAllowedOrigin(origin, allowedOrigins) {
  const normalizedOrigin = extractOrigin(origin);
  if (!normalizedOrigin) {
    return false;
  }

  return allowedOrigins.includes(normalizedOrigin);
}

export function buildWaitlistRecord({ email, attribution, nowIso, existing = null }) {
  const base = {
    email,
    first_seen_at: existing?.first_seen_at ?? nowIso,
    last_seen_at: nowIso,
    first_source_page: existing?.first_source_page ?? attribution.source_page,
    first_landing_path: existing?.first_landing_path ?? attribution.landing_path,
    first_placement: existing?.first_placement ?? attribution.placement,
    first_utm_source: existing?.first_utm_source ?? attribution.utm_source,
    first_utm_medium: existing?.first_utm_medium ?? attribution.utm_medium,
    first_utm_campaign: existing?.first_utm_campaign ?? attribution.utm_campaign,
    first_utm_content: existing?.first_utm_content ?? attribution.utm_content,
    first_utm_term: existing?.first_utm_term ?? attribution.utm_term,
    first_request_origin: existing?.first_request_origin ?? attribution.request_origin,
    first_request_referrer_origin:
      existing?.first_request_referrer_origin ?? attribution.request_referrer_origin,
    last_source_page: attribution.source_page,
    last_landing_path: attribution.landing_path,
    last_placement: attribution.placement,
    last_utm_source: attribution.utm_source,
    last_utm_medium: attribution.utm_medium,
    last_utm_campaign: attribution.utm_campaign,
    last_utm_content: attribution.utm_content,
    last_utm_term: attribution.utm_term,
    last_request_origin: attribution.request_origin,
    last_request_referrer_origin: attribution.request_referrer_origin,
    signup_count: (existing?.signup_count ?? 0) + 1,
    updated_at: nowIso,
  };

  return base;
}

export function toWaitlistInsertBindings(record) {
  return [
    record.email,
    record.first_seen_at,
    record.last_seen_at,
    record.first_source_page,
    record.first_landing_path,
    record.first_placement,
    record.first_utm_source,
    record.first_utm_medium,
    record.first_utm_campaign,
    record.first_utm_content,
    record.first_utm_term,
    record.first_request_origin,
    record.first_request_referrer_origin,
    record.last_source_page,
    record.last_landing_path,
    record.last_placement,
    record.last_utm_source,
    record.last_utm_medium,
    record.last_utm_campaign,
    record.last_utm_content,
    record.last_utm_term,
    record.last_request_origin,
    record.last_request_referrer_origin,
    record.signup_count,
    record.updated_at,
  ];
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function emitLog(logger, entry) {
  const payload = {
    service: "kobitab-waitlist",
    ...entry,
  };

  if (logger && typeof logger.log === "function") {
    logger.log(payload);
    return;
  }

  console.log(JSON.stringify(payload));
}

function buildConfig(requestUrl, settings = {}) {
  const allowedOrigins = buildAllowedOrigins(
    requestUrl,
    settings.allowedOrigins ?? SITE_ORIGINS,
  );
  const allowMissingOrigin = settings.allowMissingOrigin ?? false;
  const maxAttempts = Number.isInteger(settings.maxAttempts)
    ? settings.maxAttempts
    : REQUEST_LIMIT;
  const windowMs = Number.isInteger(settings.windowMs)
    ? settings.windowMs
    : REQUEST_WINDOW_MS;

  return {
    allowedOrigins,
    allowMissingOrigin,
    rateLimit: {
      enabled: Number.isInteger(maxAttempts) && maxAttempts > 0 && Number.isInteger(windowMs) && windowMs > 0,
      maxAttempts,
      windowMs,
    },
  };
}

function validateRequestShape(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "invalid_json" };
  }

  const email = normalizeEmail(payload.email);
  if (!email || !isValidEmail(email)) {
    return { ok: false, error: "invalid_email" };
  }

  const attributionSource =
    payload.attribution && typeof payload.attribution === "object" && !Array.isArray(payload.attribution)
      ? payload.attribution
      : payload;

  return {
    ok: true,
    email,
    attribution: normalizeAttribution(attributionSource, payload.headers ?? null),
  };
}

async function readJsonBody(request, maxBytes = 8192) {
  const text = await request.text();
  if (text.length > maxBytes) {
    throw new Error("payload_too_large");
  }

  return JSON.parse(text);
}

function getClientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

function getMethodNotAllowed() {
  return jsonResponse({ ok: false, error: { code: "method_not_allowed" } }, 405);
}

function getOriginError() {
  return jsonResponse({ ok: false, error: { code: "origin_not_allowed" } }, 403);
}

function getValidationError() {
  return jsonResponse({ ok: false, error: { code: "invalid_request" } }, 400);
}

function getUnsupportedMediaType() {
  return jsonResponse({ ok: false, error: { code: "unsupported_media_type" } }, 415);
}

function getRateLimitError() {
  return jsonResponse({ ok: false, error: { code: "rate_limited" } }, 429);
}

function getPathError() {
  return jsonResponse({ ok: false, error: { code: "not_found" } }, 404);
}

async function hashRateLimitKey(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function applyRateLimit(db, request, config, now) {
  if (!config.rateLimit.enabled) {
    return { allowed: true, attempts: 0 };
  }

  const ip = getClientIp(request) ?? "unknown";
  const origin = extractOrigin(request.headers.get("origin")) ?? extractOrigin(request.headers.get("referer")) ?? "unknown";
  const clientKey = await hashRateLimitKey([ip, origin].join("|"));
  const nowMs = now.getTime();
  const bucketStart = Math.floor(nowMs / config.rateLimit.windowMs) * config.rateLimit.windowMs;
  const cleanupBefore = bucketStart - config.rateLimit.windowMs * RATE_LIMIT_CLEANUP_MULTIPLIER;
  const nowIso = now.toISOString();

  await db.prepare(RATE_LIMIT_CLEANUP_SQL).bind(cleanupBefore).run();
  await db.prepare(RATE_LIMIT_UPSERT_SQL).bind(bucketStart, clientKey, nowIso, nowIso, nowIso).run();

  const row = await db.prepare(RATE_LIMIT_SELECT_SQL).bind(bucketStart, clientKey).first();
  const attempts = Number(row?.attempts ?? 0);

  return {
    allowed: attempts <= config.rateLimit.maxAttempts,
    attempts,
  };
}

async function upsertWaitlistSignup(db, record) {
  await db.prepare(SIGNUP_UPSERT_SQL).bind(...toWaitlistInsertBindings(record)).run();
  return db.prepare(SIGNUP_SELECT_SQL).bind(record.email).first();
}

export function createWaitlistService({ db, settings = {}, logger = console, clock = () => new Date() } = {}) {
  if (!db) {
    throw new Error("A D1 database binding is required");
  }

  return {
    async handleRequest(request) {
      const url = new URL(request.url);
      const now = clock();
      const config = buildConfig(request.url, settings);

      if (url.pathname !== "/api/waitlist") {
        return getPathError();
      }

      if (request.method !== "POST") {
        return getMethodNotAllowed();
      }

      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().startsWith("application/json")) {
        emitLog(logger, {
          event: "waitlist_signup_rejected",
          reason: "unsupported_media_type",
        });
        return getUnsupportedMediaType();
      }

      const originHeader = extractOrigin(request.headers.get("origin")) ?? extractOrigin(request.headers.get("referer"));
      if (originHeader) {
        if (!isAllowedOrigin(originHeader, config.allowedOrigins)) {
          emitLog(logger, {
            event: "waitlist_signup_rejected",
            reason: "origin_not_allowed",
            origin: originHeader,
          });
          return getOriginError();
        }
      } else if (!config.allowMissingOrigin) {
        emitLog(logger, {
          event: "waitlist_signup_rejected",
          reason: "missing_origin",
        });
        return getOriginError();
      }

      let payload;
      try {
        payload = await readJsonBody(request);
      } catch {
        emitLog(logger, {
          event: "waitlist_signup_rejected",
          reason: "invalid_json",
        });
        return getValidationError();
      }

      const validation = validateRequestShape({
        ...payload,
        headers: request.headers,
      });

      if (!validation.ok) {
        emitLog(logger, {
          event: "waitlist_signup_rejected",
          reason: validation.error,
        });
        return getValidationError();
      }

      const rateLimit = await applyRateLimit(db, request, config, now);
      if (!rateLimit.allowed) {
        emitLog(logger, {
          event: "waitlist_signup_rejected",
          reason: "rate_limited",
          attempts: rateLimit.attempts,
        });
        return getRateLimitError();
      }

      const nowIso = now.toISOString();
      const record = buildWaitlistRecord({
        email: validation.email,
        attribution: validation.attribution,
        nowIso,
      });

      await upsertWaitlistSignup(db, record);
      const storedRow = await db.prepare(SIGNUP_SELECT_SQL).bind(record.email).first();

      const signupCount = Number(storedRow?.signup_count ?? record.signup_count);

      emitLog(logger, {
        event: "waitlist_signup_accepted",
        result: signupCount > 1 ? "duplicate_or_repeat" : "new",
        placement: validation.attribution.placement,
        source_page: validation.attribution.source_page,
      });

      return jsonResponse({
        ok: true,
        status: "accepted",
      });
    },
  };
}

export {
  applyRateLimit,
  buildConfig,
  getClientIp,
  getMethodNotAllowed,
  getOriginError,
  getRateLimitError,
  getValidationError,
  getUnsupportedMediaType,
  readJsonBody,
  validateRequestShape,
  upsertWaitlistSignup,
};
