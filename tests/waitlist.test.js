import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWaitlistAttribution,
  buildWaitlistPayload,
  isValidWaitlistEmail,
  normalizeWaitlistEmail
} from '../src/waitlist.js'

test('normalizeWaitlistEmail trims and lowercases input', () => {
  assert.equal(normalizeWaitlistEmail('  Kobi.Preview+Early@Example.COM  '), 'kobi.preview+early@example.com')
})

test('isValidWaitlistEmail accepts common email addresses', () => {
  assert.equal(isValidWaitlistEmail('join@kobitab.com'), true)
  assert.equal(isValidWaitlistEmail('bad-address'), false)
  assert.equal(isValidWaitlistEmail('   '), false)
})

test('buildWaitlistAttribution keeps attribution minimal and stable', () => {
  assert.deepEqual(
    buildWaitlistAttribution({
      currentUrl: 'https://kobitab.com/?utm_source=newsletter&utm_medium=email&utm_campaign=premium-launch&utm_content=hero',
      referrer: 'https://news.ycombinator.com/item?id=123',
      placement: 'trust-cta'
    }),
    {
      placement: 'trust-cta',
      landing_path: '/',
      referrer_host: 'news.ycombinator.com',
      utm_source: 'newsletter',
      utm_medium: 'email',
      utm_campaign: 'premium-launch',
      utm_content: 'hero',
      utm_term: ''
    }
  )
})

test('buildWaitlistPayload normalizes valid emails and rejects invalid ones', () => {
  assert.deepEqual(
    buildWaitlistPayload({
      email: '  Join@Kobitab.com ',
      currentUrl: 'https://kobitab.com/premium?utm_source=twitter&utm_campaign=preview',
      referrer: 'https://example.com/article',
      sourcePage: 'premium_waitlist',
      placement: 'footer-cta'
    }),
    {
      email: 'join@kobitab.com',
      attribution: {
        source_page: 'premium_waitlist',
        placement: 'footer-cta',
        landing_path: '/premium',
        referrer_host: 'example.com',
        utm_source: 'twitter',
        utm_medium: '',
        utm_campaign: 'preview',
        utm_content: '',
        utm_term: ''
      }
    }
  )

  assert.equal(
    buildWaitlistPayload({
      email: 'nope',
      currentUrl: 'https://kobitab.com/'
    }),
    null
  )
})
