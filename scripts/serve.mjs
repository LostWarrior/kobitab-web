import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const port = 3000

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.md': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0])
  let filePath = resolve(distDir, urlPath === '/' ? 'index.html' : '.' + urlPath)

  if (!filePath.startsWith(distDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' })
    res.end('403 Forbidden')
    return
  }

  try {
    const targetStat = await stat(filePath)
    if (targetStat.isDirectory()) {
      filePath = join(filePath, 'index.html')
    }

    const data = await readFile(filePath)
    const ext = extname(filePath)
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('404 Not Found')
  }
})

server.listen(port, () => {
  console.log(`Dev server running at http://localhost:${port}`)
})
