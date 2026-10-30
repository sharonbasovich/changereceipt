/** Strict localhost preview of the static artifact, not a deployment service. */
import { createServer } from 'node:http'
import { readFile, realpath, stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import console from 'node:console'

const portText = process.env.CHANGERECEIPT_HOSTED_PORT ?? '4186'
if (!/^[0-9]+$/.test(portText) || Number(portText) < 1024 || Number(portText) > 65535)
  throw new Error('CHANGERECEIPT_HOSTED_PORT must be an integer from 1024 through 65535')
const port = Number(portText)
const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '../dist-hosted'))
if (!(await stat(resolve(root, 'index.html'))).isFile())
  throw new Error('Run npm run build:hosted first')
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}
const server = createServer(async (request, response) => {
  const reply = (code, text, headers = {}) => {
    response.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', ...headers })
    response.end(request.method === 'HEAD' ? undefined : text)
  }
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host))
    return reply(403, 'Local preview only.\n')
  if (!['GET', 'HEAD'].includes(request.method))
    return reply(405, 'Static files only.\n', { Allow: 'GET, HEAD' })
  try {
    const route = decodeURIComponent((request.url ?? '').split('?')[0])
    if (
      !route.startsWith('/') ||
      route.startsWith('//') ||
      route.includes('\\') ||
      [...route].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ) ||
      route.split('/').includes('..')
    )
      return reply(400, 'Invalid path.\n')
    if (route === '/changereceipt') return reply(308, '', { Location: '/changereceipt/' })
    if (!route.startsWith('/changereceipt/')) return reply(404, 'Not found.\n')
    const suffix = route.slice('/changereceipt/'.length)
    const file = await realpath(resolve(root, suffix || 'index.html'))
    const local = relative(root, file)
    if (
      local === '..' ||
      local.startsWith('../') ||
      local.startsWith('..\\') ||
      isAbsolute(local) ||
      !(await stat(file)).isFile()
    )
      return reply(404, 'Not found.\n')
    const bytes = await readFile(file)
    response.writeHead(200, {
      'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
      'Content-Length': bytes.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    response.end(request.method === 'HEAD' ? undefined : bytes)
  } catch {
    reply(404, 'Not found.\n')
  }
})
server.on('error', (error) => {
  console.error(error.message)
  process.exitCode = 1
})
server.listen(port, '127.0.0.1', () =>
  console.log(`Static demo: http://127.0.0.1:${port}/changereceipt/`),
)
