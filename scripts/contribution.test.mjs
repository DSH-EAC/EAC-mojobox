import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { generatePackLock } from './lock-pack.mjs'
import { generateSite } from './build-site.mjs'
import { inspectPack } from './inspect-pack.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

test('a contributed Pack passes locking, publication and inspection without business-code changes; appearance reuses the same pipeline', async t => {
  const root = await mkdtemp(join(tmpdir(), 'mojobox-contribution-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  // Source data is copied, but artifacts are synthetic: no repository cache or network is required.
  await Promise.all(['schemas', 'vendor', 'catalog', 'distribution.json', 'spec-revisions.json']
    .map(path => cp(join(repositoryRoot, path), join(root, path), { recursive: true })))
  await rm(join(root, 'catalog/evidence'), { recursive: true })
  await mkdir(join(root, 'catalog/evidence'))
  await mkdir(join(root, '.cache/artifacts'), { recursive: true })
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Contribution tests must not access the network') })
  for (const file of await readdir(join(root, 'catalog/plugins'))) {
    const path = join(root, 'catalog/plugins', file)
    const manifest = JSON.parse(await readFile(path, 'utf8'))
    if (!manifest.artifact) continue
    const bytes = Buffer.from(`test-only artifact for ${manifest.id}@${manifest.version}`)
    manifest.artifact.digest = digest(bytes)
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`)
    await writeFile(join(root, '.cache/artifacts', manifest.artifact.digest.slice(7)), bytes)
  }

  const pack = JSON.parse(await readFile(join(root, 'catalog/packs/dev.mojobox.focus-kit.pack.json'), 'utf8'))
  pack.metadata = { ...pack.metadata, id: 'org.example.contributed-tools', name: 'Contributed tools', category: 'function' }
  await writeFile(join(root, `catalog/packs/${pack.metadata.id}.pack.json`), `${JSON.stringify(pack, null, 2)}\n`)
  for (const file of await readdir(join(root, 'catalog/packs'))) {
    if (file.endsWith('.pack.json')) await generatePackLock(`catalog/packs/${file}`, { root })
  }

  const catalog = await generateSite(root)
  const published = catalog.packs.find(item => item.metadata.id === pack.metadata.id)
  assert.ok(published, 'the new Pack must enter the public catalog')
  assert.ok(catalog.packs.every(item => item.metadata.category === 'function'))
  assert.equal(catalog.packs.some(item => item.metadata.id === 'dev.aio.appearance'), false)
  const files = await readdir(join(root, 'site/public/generated/downloads'))
  assert.equal(files.some(file => file.startsWith('dev.aio.appearance-')), false)
  const inspected = await inspectPack(join(root, 'site/public', published.archiveUrl))
  assert.equal(inspected.metadata.id, pack.metadata.id)
  assert.equal(inspected.verified, 'structure-and-digests')
  assert.deepEqual(inspected.components.map(({ id, version, required }) => ({ id, version, required })), pack.components)
  const archiveBytes = await readFile(join(root, 'site/public', published.archiveUrl))
  assert.equal(published.archiveDigest, digest(archiveBytes))
  assert.equal(published.archiveSize, archiveBytes.length)

  await writeFile(join(root, 'distribution.json'), JSON.stringify({ packCategories: ['function', 'appearance'] }))
  const expanded = await generateSite(root)
  const appearance = expanded.packs.find(item => item.metadata.id === 'dev.aio.appearance')
  assert.ok(appearance, 'appearance publication requires only a policy change')
  const appearanceResult = await inspectPack(join(root, 'site/public', appearance.archiveUrl))
  assert.equal(appearanceResult.metadata.category, 'appearance')
  assert.equal(appearanceResult.components.length, appearance.components.length)
  assert.equal(expanded.packs.find(item => item.metadata.id === pack.metadata.id).archiveDigest, published.archiveDigest)
})
