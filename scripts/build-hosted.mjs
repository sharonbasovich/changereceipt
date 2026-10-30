import { build } from 'vite'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import console from 'node:console'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'dist-hosted')
assert.equal(dirname(output), root)

async function fingerprints(directory) {
  const result = {}
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const file = join(current, entry.name)
      assert.ok(!entry.isSymbolicLink(), 'Build artifacts must not contain symlinks')
      if (entry.isDirectory()) await visit(file)
      else
        result[relative(directory, file).replaceAll('\\', '/')] = createHash('sha256')
          .update(await readFile(file))
          .digest('hex')
    }
  }
  try {
    await visit(directory)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  return result
}

const localBefore = await fingerprints(join(root, 'dist'))
await build({ mode: 'hosted', root })
assert.deepEqual(
  await fingerprints(join(root, 'dist')),
  localBefore,
  'Hosted build changed local dist',
)
await mkdir(output, { recursive: true })
await writeFile(join(output, '.nojekyll'), '')
await copyFile(join(root, 'THIRD-PARTY-NOTICES.txt'), join(output, 'THIRD-PARTY-NOTICES.txt'))
const files = await fingerprints(output)
delete files['BUILD-MANIFEST.json'] // The manifest cannot fingerprint itself, including on rebuild.
const manifest = {
  format: 'ChangeReceipt static demo',
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceDirty:
    execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length >
    0,
  basePath: '/changereceipt/',
  localDistPreserved: true,
  inputData:
    'CSV contents are processed in browser memory; no upload endpoint or persistent session.',
  hostingMetadata: 'The hosting provider receives ordinary page and asset request metadata.',
  files,
}
await writeFile(join(output, 'BUILD-MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`Hosted artifact: ${output}\nBase path: /changereceipt/\nLocal dist unchanged.`)
