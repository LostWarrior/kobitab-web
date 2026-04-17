import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAllowedOrigins,
  buildWaitlistRecord,
  createWaitlistService,
  isAllowedOrigin,
  normalizeAttribution,
  normalizeEmail,
} from "../src/waitlist.js";

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.bindings = [];
  }

  bind(...bindings) {
    this.bindings = bindings;
    return this;
  }

  async run() {
    return this.db.run(this.sql, this.bindings);
  }

  async first() {
    return this.db.first(this.sql, this.bindings);
  }
}

class FakeDatabase {
  constructor() {
    this.signups = new Map();
    this.rateLimits = new Map();
    this.calls = [];
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  #normalizeSql(sql) {
    return String(sql).trimStart();
  }

  async run(sql, bindings) {
    this.calls.push({ sql, bindings, type: "run" });
    const normalizedSql = this.#normalizeSql(sql);

    if (normalizedSql.startsWith("INSERT INTO waitlist_signups")) {
      return this.#upsertSignup(bindings);
    }

    if (normalizedSql.startsWith("INSERT INTO waitlist_rate_limits")) {
      return this.#upsertRateLimit(bindings);
    }

    if (normalizedSql.startsWith("DELETE FROM waitlist_rate_limits")) {
      return this.#deleteExpiredRateLimits(bindings);
    }

    throw new Error(`Unexpected SQL in run(): ${sql}`);
  }

  async first(sql, bindings) {
    this.calls.push({ sql, bindings, type: "first" });
    const normalizedSql = this.#normalizeSql(sql);

    if (normalizedSql.startsWith("SELECT") && normalizedSql.includes("FROM waitlist_signups")) {
      return this.signups.get(bindings[0]) ?? null;
    }

    if (normalizedSql.startsWith("SELECT") && normalizedSql.includes("FROM waitlist_rate_limits")) {
      const key = `${bindings[0]}:${bindings[1]}`;
      return this.rateLimits.get(key) ?? null;
    }

    throw new Error(`Unexpected SQL in first(): ${sql}`);
  }

  #upsertSignup(bindings) {
    const email = bindings[0];
    const existing = this.signups.get(email);
    const row = {
      email,
      first_seen_at: bindings[1],
      last_seen_at: bindings[2],
      first_source_page: bindings[3],
      first_landing_path: bindings[4],
      first_placement: bindings[5],
      first_utm_source: bindings[6],
      first_utm_medium: bindings[7],
      first_utm_campaign: bindings[8],
      first_utm_content: bindings[9],
      first_utm_term: bindings[10],
      first_request_origin: bindings[11],
      first_request_referrer_origin: bindings[12],
      last_source_page: bindings[13],
      last_landing_path: bindings[14],
      last_placement: bindings[15],
      last_utm_source: bindings[16],
      last_utm_medium: bindings[17],
      last_utm_campaign: bindings[18],
      last_utm_content: bindings[19],
      last_utm_term: bindings[20],
      last_request_origin: bindings[21],
      last_request_referrer_origin: bindings[22],
      signup_count: bindings[23],
      updated_at: bindings[24],
    };

    if (existing) {
      row.first_seen_at = existing.first_seen_at;
      row.first_source_page = existing.first_source_page;
      row.first_landing_path = existing.first_landing_path;
      row.first_placement = existing.first_placement;
      row.first_utm_source = existing.first_utm_source;
      row.first_utm_medium = existing.first_utm_medium;
      row.first_utm_campaign = existing.first_utm_campaign;
      row.first_utm_content = existing.first_utm_content;
      row.first_utm_term = existing.first_utm_term;
      row.first_request_origin = existing.first_request_origin;
      row.first_request_referrer_origin = existing.first_request_referrer_origin;
      row.signup_count = existing.signup_count + 1;
    }

    this.signups.set(email, row);
    return { success: true, meta: { changes: 1 } };
  }

  #upsertRateLimit(bindings) {
    const bucketStart = bindings[0];
    const clientKey = bindings[1];
    const key = `${bucketStart}:${clientKey}`;
    const existing = this.rateLimits.get(key);
    const row = existing
      ? {
          ...existing,
          attempts: existing.attempts + 1,
          last_seen_at: bindings[2],
          updated_at: bindings[3],
        }
      : {
          bucket_start: bucketStart,
          client_key: clientKey,
          attempts: 1,
          first_seen_at: bindings[2],
          last_seen_at: bindings[2],
          updated_at: bindings[3],
        };

    this.rateLimits.set(key, row);
    return { success: true, meta: { changes: 1 } };
  }

  #deleteExpiredRateLimits(bindings) {
    const cutoff = bindings[0];
    for (const [key, row] of this.rateLimits.entries()) {
      if (row.bucket_start < cutoff) {
        this.rateLimits.delete(key);
      }
    }
    return { success: true, meta: { changes: 1 } };
  }
}

test("normalizeEmail trims, lowercases, and rejects empty values", () => {
  assert.equal(normalizeEmail("  Premium@Kobitab.COM  "), "premium@kobitab.com");
  assert.equal(normalizeEmail(""), null);
  assert.equal(normalizeEmail("   "), null);
  assert.equal(normalizeEmail(null), null);
});

test("normalizeAttribution keeps minimal attribution and removes query strings", () => {
  const attribution = normalizeAttribution({
    source_page: "  footer CTA  \n",
    landing_path: "https://kobitab.com/download?utm_source=ads#section",
    placement: " below-fold ",
    utm_source: " Newsletter ",
    utm_medium: " Email ",
    utm_campaign: " Launch ",
    utm_content: " Hero Button ",
    utm_term: " Kobi Tab ",
  });

  assert.deepEqual(attribution, {
    source_page: "footer CTA",
    landing_path: "/download",
    placement: "below-fold",
    utm_source: "Newsletter",
    utm_medium: "Email",
    utm_campaign: "Launch",
    utm_content: "Hero Button",
    utm_term: "Kobi Tab",
    request_origin: null,
    request_referrer_origin: null,
  });
});

test("buildAllowedOrigins includes request origin and configured origins", () => {
  const allowedOrigins = buildAllowedOrigins(
    "https://kobitab.com/api/waitlist",
    " https://www.kobitab.com , http://localhost:8788 "
  );

  assert.deepEqual(allowedOrigins, [
    "https://kobitab.com",
    "https://www.kobitab.com",
    "http://localhost:8788",
  ]);
  assert.equal(isAllowedOrigin("https://kobitab.com", allowedOrigins), true);
  assert.equal(isAllowedOrigin("https://evil.example", allowedOrigins), false);
});

test("buildWaitlistRecord preserves first-touch attribution and updates last-touch fields", () => {
  const existing = {
    first_seen_at: "2026-04-17T10:00:00.000Z",
    last_seen_at: "2026-04-17T10:00:00.000Z",
    signup_count: 1,
    first_source_page: "hero",
    first_landing_path: "/",
    first_placement: "hero",
    first_utm_source: "newsletter",
    first_utm_medium: "email",
    first_utm_campaign: "alpha",
    first_utm_content: "cta-a",
    first_utm_term: "kobitab",
    first_request_origin: "https://kobitab.com",
    first_request_referrer_origin: "https://kobitab.com",
  };

  const record = buildWaitlistRecord({
    email: "premium@example.com",
    attribution: {
      source_page: "footer",
      landing_path: "/pricing",
      placement: "footer",
      utm_source: "partner",
      utm_medium: "referral",
      utm_campaign: "beta",
      utm_content: "cta-b",
      utm_term: "premium",
      request_origin: "https://kobitab.com",
      request_referrer_origin: "https://kobitab.com",
    },
    nowIso: "2026-04-17T11:00:00.000Z",
    existing,
  });

  assert.equal(record.email, "premium@example.com");
  assert.equal(record.first_seen_at, "2026-04-17T10:00:00.000Z");
  assert.equal(record.last_seen_at, "2026-04-17T11:00:00.000Z");
  assert.equal(record.signup_count, 2);
  assert.equal(record.first_source_page, "hero");
  assert.equal(record.last_source_page, "footer");
  assert.equal(record.first_placement, "hero");
  assert.equal(record.last_placement, "footer");
});

test("createWaitlistService stores a signup and preserves first-touch attribution on duplicate submissions", async () => {
  const db = new FakeDatabase();
  const logs = [];
  const service = createWaitlistService({
    db,
    logger: {
      log(entry) {
        logs.push(entry);
      },
    },
    clock: () => new Date("2026-04-17T12:00:00.000Z"),
  });

  const request = new Request("https://kobitab.com/api/waitlist", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://kobitab.com",
      "CF-Connecting-IP": "203.0.113.10",
    },
    body: JSON.stringify({
      email: "Premium@Example.com",
      attribution: {
        source_page: "hero",
        landing_path: "https://kobitab.com/",
        placement: "hero",
        utm_source: "newsletter",
      },
    }),
  });

  const firstResponse = await service.handleRequest(request);
  assert.equal(firstResponse.status, 200);
  assert.deepEqual(await firstResponse.json(), { ok: true, status: "accepted" });

  const duplicateRequest = new Request("https://kobitab.com/api/waitlist", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://kobitab.com",
      "CF-Connecting-IP": "203.0.113.10",
    },
    body: JSON.stringify({
      email: "premium@example.com",
      attribution: {
        source_page: "footer",
        landing_path: "/pricing",
        placement: "footer",
        utm_source: "partner",
      },
    }),
  });

  const secondResponse = await service.handleRequest(duplicateRequest);
  assert.equal(secondResponse.status, 200);
  assert.deepEqual(await secondResponse.json(), { ok: true, status: "accepted" });

  const row = db.signups.get("premium@example.com");
  assert.equal(row.first_source_page, "hero");
  assert.equal(row.last_source_page, "footer");
  assert.equal(row.signup_count, 2);
  assert.ok(
    logs.some((entry) => entry.event === "waitlist_signup_accepted"),
    "expected a structured success log",
  );
});

test("createWaitlistService rejects disallowed origins and rate limits abusive traffic", async () => {
  const db = new FakeDatabase();
  const service = createWaitlistService({
    db,
    settings: {
      maxAttempts: 1,
    },
    clock: () => new Date("2026-04-17T12:00:00.000Z"),
    logger: { log() {} },
  });

  const rejected = await service.handleRequest(
    new Request("https://kobitab.com/api/waitlist", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example",
      },
      body: JSON.stringify({ email: "blocked@example.com" }),
    }),
  );

  assert.equal(rejected.status, 403);

  const accepted = await service.handleRequest(
    new Request("https://kobitab.com/api/waitlist", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://kobitab.com",
        "CF-Connecting-IP": "198.51.100.23",
      },
      body: JSON.stringify({ email: "limited@example.com" }),
    }),
  );

  assert.equal(accepted.status, 200);

  const limited = await service.handleRequest(
    new Request("https://kobitab.com/api/waitlist", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://kobitab.com",
        "CF-Connecting-IP": "198.51.100.23",
      },
      body: JSON.stringify({ email: "limited-2@example.com" }),
    }),
  );

  assert.equal(limited.status, 429);
});

test("createWaitlistService rejects non-JSON payloads", async () => {
  const db = new FakeDatabase();
  const service = createWaitlistService({
    db,
    clock: () => new Date("2026-04-17T12:00:00.000Z"),
    logger: { log() {} },
  });

  const response = await service.handleRequest(
    new Request("https://kobitab.com/api/waitlist", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        Origin: "https://kobitab.com",
      },
      body: "email=test@example.com",
    }),
  );

  assert.equal(response.status, 415);
});
