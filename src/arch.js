// Local-only detection. The result must never be sent, stored, or logged.
export async function detectMacArch(nav = globalThis.navigator, createCanvas = defaultCanvas) {
  try {
    const high = await nav?.userAgentData?.getHighEntropyValues?.(['architecture'])
    if (high?.architecture === 'arm') return 'arm64'
    if (high?.architecture === 'x86') return 'x64'
  } catch {}

  try {
    const gl = createCanvas()
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''
    if (renderer.includes('Apple M')) return 'arm64'
  } catch {}

  return 'arm64'
}

export function isMac(nav = globalThis.navigator) {
  return /Mac/i.test(nav?.platform || nav?.userAgent || '') && !(nav?.maxTouchPoints > 1)
}

function defaultCanvas() {
  const canvas = document.createElement('canvas')
  return canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
}
