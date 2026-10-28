import { createServer } from 'node:http'
import { readFile, realpath, stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import console from 'node:console'

const portText = process.env.CHANGERECEIPT_PORT ?? '4173'
if (!/^[0-9]+$/.test(portText) || Number(portText) < 1024 || Number(portText) > 65535) {
  console.error('CHANGERECEIPT_PORT must be an integer from 1024 through 65535.')
  process.exit(1)
}
const port = Number(portText)
let root
try {
  root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), 'dist'))
  if (!(await stat(resolve(root, 'index.html'))).isFile()) throw new Error('Missing index')
} catch {
  console.error(
    'Compiled app missing. Extract the complete release ZIP, or run npm ci and npm run build in a source checkout.',
  )
  process.exit(1)
}
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}
const server = createServer(async (request, response) => {
  const reply = (status, message, headers = {}) => {
    response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers })
    response.end(request.method === 'HEAD' ? undefined : message)
  }
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host)) {
    reply(403, 'Local access only.\n')
    return
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    reply(405, 'Use GET or HEAD.\n', { Allow: 'GET, HEAD' })
    return
  }
  let path
  try {
    path = decodeURIComponent((request.url ?? '').split('?')[0])
    if (
      !path.startsWith('/') ||
      path.startsWith('//') ||
      path.includes('\\') ||
      [...path].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ) ||
      path.split('/').includes('..')
    ) {
      reply(400, 'Invalid path.\n')
      return
    }
  } catch {
    reply(400, 'Invalid path.\n')
    return
  }
  try {
    const file = await realpath(resolve(root, `.${path === '/' ? '/index.html' : path}`))
    const local = relative(root, file)
    if (
      local === '..' ||
      local.startsWith('../') ||
      local.startsWith('..\\') ||
      isAbsolute(local)
    ) {
      reply(404, 'Not found.\n')
      return
    }
    if (!(await stat(file)).isFile()) {
      reply(404, 'Not found.\n')
      return
    }
    const bytes = await readFile(file)
    response.writeHead(200, {
      'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
      'Content-Length': bytes.length,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    })
    response.end(request.method === 'HEAD' ? undefined : bytes)
  } catch {
    reply(404, 'Not found.\n')
  }
})
server.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `Port ${port} is already in use. Set CHANGERECEIPT_PORT to another port from 1024 through 65535.`
      : `Could not start the local server (${error.code ?? 'unknown error'}).`,
  )
  process.exitCode = 1
})
server.listen(port, '127.0.0.1', () => {
  console.log(
    `ChangeReceipt: http://127.0.0.1:${port}/\nPress Ctrl+C to stop. Files are processed in your browser.`,
  )
})
