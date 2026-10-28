import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer, request } from 'node:http'
import { once } from 'node:events'
import process from 'node:process'
import { setTimeout } from 'node:timers'
import { URL } from 'node:url'

async function unusedPort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}
function get(port, path = '/', method = 'GET', host = `127.0.0.1:${port}`) {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path, method, headers: { Host: host } },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (part) => {
          body += part
        })
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
      },
    )
    req.on('error', reject)
    req.end()
  })
}
async function start(folder, port) {
  const child = spawn(process.execPath, [join(folder, 'server.mjs')], {
    cwd: tmpdir(),
    env: { ...process.env, CHANGERECEIPT_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => {
    output += chunk
  })
  child.stderr.on('data', (chunk) => {
    output += chunk
  })
  const done = new Promise((resolve) => child.on('exit', (code) => resolve({ code, output })))
  await Promise.race([
    new Promise((resolve) => child.stdout.once('data', resolve)),
    done,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Startup timed out')), 5000).unref(),
    ),
  ])
  return { child, done, output: () => output }
}

test('production launcher serves only compiled local files and stays healthy after bad requests', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'changereceipt-server-'))
  t.after(() => rm(folder, { recursive: true, force: true }))
  await copyFile(new URL('../server.mjs', import.meta.url), join(folder, 'server.mjs'))
  await mkdir(join(folder, 'dist', 'assets'), { recursive: true })
  await mkdir(join(folder, 'dist', 'fixtures'))
  await writeFile(join(folder, 'dist', 'index.html'), '<h1>ChangeReceipt test</h1>')
  await writeFile(join(folder, 'dist', 'assets', 'app.js'), 'console.log("synthetic")')
  await writeFile(join(folder, 'dist', 'assets', 'app.css'), 'body{}')
  await writeFile(join(folder, 'dist', 'fixtures', 'demo.csv'), 'id,label\n1,Synthetic\n')
  await writeFile(join(folder, 'secret.txt'), 'must not serve')
  await symlink(join(folder, 'secret.txt'), join(folder, 'dist', 'escape.txt'))
  const port = await unusedPort()
  const run = await start(folder, port)
  t.after(async () => {
    run.child.kill()
    await run.done
  })
  assert.match(run.output(), new RegExp(`http://127.0.0.1:${port}/`))
  const page = await get(port)
  assert.equal(page.status, 200)
  assert.equal(page.body, '<h1>ChangeReceipt test</h1>')
  assert.equal(page.headers['content-type'], 'text/html; charset=utf-8')
  assert.equal(page.headers['x-content-type-options'], 'nosniff')
  assert.equal(page.headers['cache-control'], 'no-store')
  const head = await get(port, '/', 'HEAD')
  assert.equal(head.status, 200)
  assert.equal(head.body, '')
  assert.equal(head.headers['content-length'], page.headers['content-length'])
  for (const [path, mime] of [
    ['/assets/app.js?x=1', 'text/javascript'],
    ['/assets/app.css', 'text/css'],
    ['/fixtures/demo.csv', 'text/csv'],
  ]) {
    const result = await get(port, path)
    assert.equal(result.status, 200)
    assert.ok(result.headers['content-type'].startsWith(mime))
  }
  assert.equal((await get(port, '/assets/%61pp.js')).status, 200)
  assert.equal((await get(port, '/', 'GET', `localhost:${port}`)).status, 200)
  assert.equal((await get(port, '/', 'GET', 'example.invalid')).status, 403)
  assert.equal((await get(port, '/', 'POST')).status, 405)
  for (const path of ['/missing.js', '/assets/', '/escape.txt', '/server.mjs'])
    assert.equal((await get(port, path)).status, 404, path)
  for (const path of [
    '/../secret.txt',
    '/%2e%2e/secret.txt',
    '/%2e%2e%2fsecret.txt',
    '/a%5c..%5csecret.txt',
    '/%00',
    '/%ff',
    '/%zz',
    '//example.invalid',
  ]) {
    assert.equal((await get(port, path)).status, 400, path)
  }
  assert.equal((await get(port)).status, 200)
  const occupied = await start(folder, port)
  assert.equal((await occupied.done).code, 1)
  assert.match(occupied.output(), /already in use/)
})

test('missing build and invalid port fail with actionable messages', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'changereceipt-missing-'))
  t.after(() => rm(folder, { recursive: true, force: true }))
  await copyFile(new URL('../server.mjs', import.meta.url), join(folder, 'server.mjs'))
  const missing = await start(folder, await unusedPort())
  assert.equal((await missing.done).code, 1)
  assert.match(missing.output(), /Compiled app missing/)
  for (const port of ['', '0', '1023', '65536', '4173x', '4.5', '-1', ' 4173']) {
    const invalid = await start(folder, port)
    assert.equal((await invalid.done).code, 1)
    assert.match(invalid.output(), /must be an integer/)
  }
})
