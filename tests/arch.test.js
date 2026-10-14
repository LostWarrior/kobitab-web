import assert from 'node:assert/strict'
import test from 'node:test'

import { detectMacArch, isMac } from '../src/arch.js'

const uaData = (architecture) => ({
  userAgentData: { getHighEntropyValues: async () => ({ architecture }) }
})
const gl = (renderer) => () => ({
  getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }),
  getParameter: () => renderer
})

test('userAgentData architecture wins', async () => {
  assert.equal(await detectMacArch(uaData('arm'), gl('Intel Iris')), 'arm64')
  assert.equal(await detectMacArch(uaData('x86'), gl('Apple M1')), 'x64')
})

test('falls back to the WebGL renderer, then to Apple Silicon', async () => {
  assert.equal(await detectMacArch({}, gl('ANGLE (Apple, Apple M2, OpenGL)')), 'arm64')
  assert.equal(await detectMacArch({}, gl('Intel Iris Pro')), 'arm64')
  assert.equal(await detectMacArch({}, () => { throw new Error('no webgl') }), 'arm64')
})

test('isMac excludes touch devices and other platforms', () => {
  assert.equal(isMac({ platform: 'MacIntel', maxTouchPoints: 0 }), true)
  assert.equal(isMac({ platform: 'MacIntel', maxTouchPoints: 5 }), false)
  assert.equal(isMac({ platform: 'Win32' }), false)
})
